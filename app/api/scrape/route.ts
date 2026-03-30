import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (process.env.NODE_ENV === 'production' && key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. 日付の決定
    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || jstNow.toISOString().split('T')[0];
    
    // 【修正ポイント】ご提示いただいた1軍(first)のURL構造に合わせる
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${targetDate}`;
    logs.push(`Accessing: ${scheduleUrl}`);

    const res = await axios.get(scheduleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
    });
    const $sched = cheerio.load(res.data);
    
    const gameUrls: string[] = [];
    $sched('a').each((_, el) => {
      const href = $sched(el).attr('href') || '';
      // /game/数字/ というリンクを抽出
      const gameMatch = href.match(/\/game\/(\d+)\//);
      if (gameMatch) {
        const statsUrl = `https://baseball.yahoo.co.jp/npb/game/${gameMatch[1]}/stats`;
        if (!gameUrls.includes(statsUrl)) gameUrls.push(statsUrl);
      }
    });

    if (gameUrls.length === 0) {
      return NextResponse.json({ success: true, message: "No games found.", date: targetDate, url: scheduleUrl });
    }

    logs.push(`Found ${gameUrls.length} games. Processing...`);

    const { data: players } = await supabase.from('players').select('*');
    const playerMap = new Map();
    players?.forEach(p => playerMap.set((p.player_name || p.name).replace(/\s+/g, ''), p));

    const statsByDate: Record<string, any> = {};

    for (const url of gameUrls) {
      try {
        const gameRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(gameRes.data);
        
        const title = $('title').text();
        const dMatch = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!dMatch) continue;
        const actualDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;

        if (!statsByDate[actualDate]) statsByDate[actualDate] = {};

        $('.bb-statsTable').each((_, table) => {
          const ths: string[] = [];
          $(table).find('thead th').each((__, th) => { ths.push($(th).text().trim()); });
          
          // 列番号の特定 (安打、本塁打、打点)
          const hitIdx = ths.indexOf('安打');
          const hrIdx  = ths.indexOf('本塁打');
          const rbiIdx = ths.indexOf('打点');

          // 打撃成績テーブル（打数あり）かつ投手成績（防御率なし）を対象に
          if (hitIdx === -1 || ths.includes('防御率') || !ths.includes('打数')) return;

          $(table).find('tr.bb-statsTable__row').each((___, row) => {
            const pLink = $(row).find('a[href*="/player/"]');
            if (pLink.length > 0) {
              const name = pLink.text().trim().replace(/\s+/g, '');
              const pInfo = playerMap.get(name);
              if (pInfo) {
                const tds = $(row).find('td');
                const h = parseInt($(tds[hitIdx]).text()) || 0;
                const hr = parseInt($(tds[hrIdx]).text()) || 0;
                const r = parseInt($(tds[rbiIdx]).text()) || 0;

                if (h > 0 || hr > 0 || r > 0) {
                  const id = pInfo.player_id || pInfo.id;
                  if (!statsByDate[actualDate][id]) {
                    statsByDate[actualDate][id] = { player_id: id, player_name: name, date: actualDate, h_hits: 0, h_hr: 0, h_rbi: 0 };
                  }
                  statsByDate[actualDate][id].h_hits += h;
                  statsByDate[actualDate][id].h_hr += hr;
                  statsByDate[actualDate][id].h_rbi += r;
                }
              }
            }
          });
        });
      } catch (err) { continue; }
    }

    let updatedCount = 0;
    for (const d of Object.keys(statsByDate)) {
      const data = Object.values(statsByDate[d]);
      await supabase.from('daily_performance').delete().eq('date', d);
      await supabase.from('daily_performance').insert(data);
      updatedCount += data.length;
    }

    return NextResponse.json({ success: true, date: targetDate, players: updatedCount, logs });

  } catch (error: any) {
    return NextResponse.json({ error: error.message, logs }, { status: 500 });
  }
}