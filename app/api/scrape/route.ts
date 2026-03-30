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

    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || jstNow.toISOString().split('T')[0];
    
    // 1. スケジュールページの取得
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${targetDate}`;
    logs.push(`Accessing: ${scheduleUrl}`);

    const res = await axios.get(scheduleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (s) => s < 500 
    });

    if (res.status !== 200) {
      return NextResponse.json({ error: `Schedule Page 404 for ${targetDate}`, url: scheduleUrl }, { status: 404 });
    }

    const $sched = cheerio.load(res.data);
    
    // 【重要】Setを使って試合IDの重複を排除する
    const gameIds = new Set<string>();
    $sched('a').each((_, el) => {
      const href = $sched(el).attr('href') || '';
      const match = href.match(/\/game\/(\d+)\//);
      if (match) gameIds.add(match[1]);
    });

    const gameUrls = Array.from(gameIds).map(id => `https://baseball.yahoo.co.jp/npb/game/${id}/stats`);
    logs.push(`Unique games found: ${gameUrls.length}`); // ここが「6」になれば正常

    if (gameUrls.length === 0) {
      return NextResponse.json({ success: true, message: "No games.", date: targetDate });
    }

    const { data: players } = await supabase.from('players').select('*');
    const playerMap = new Map();
    players?.forEach(p => playerMap.set((p.player_name || p.name).replace(/\s+/g, ''), p));

    const statsByDate: Record<string, any> = {};

    // 2. 各試合の解析
    for (const url of gameUrls) {
      try {
        const gameRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const $ = cheerio.load(gameRes.data);
        const title = $('title').text();
        const dMatch = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!dMatch) continue;
        const actualDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;

        if (!statsByDate[actualDate]) statsByDate[actualDate] = {};

        $('.bb-statsTable').each((_, table) => {
          const ths: string[] = [];
          $(table).find('thead th').each((__, th) => { ths.push($(th).text().trim()); });
          const hitIdx = ths.indexOf('安打');
          const hrIdx  = ths.indexOf('本塁打');
          const rbiIdx = ths.indexOf('打点');

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

                const id = pInfo.player_id || pInfo.id;
                if (!statsByDate[actualDate][id]) {
                  statsByDate[actualDate][id] = { player_id: id, player_name: name, date: actualDate, h_hits: 0, h_hr: 0, h_rbi: 0 };
                }
                statsByDate[actualDate][id].h_hits += h;
                statsByDate[actualDate][id].h_hr += hr;
                statsByDate[actualDate][id].h_rbi += r;
              }
            }
          });
        });
      } catch (err) { logs.push(`Error in ${url}`); continue; }
    }

    // 3. 保存
    for (const d of Object.keys(statsByDate)) {
      const data = Object.values(statsByDate[d]);
      await supabase.from('daily_performance').delete().eq('date', d);
      await supabase.from('daily_performance').insert(data);
    }

    return NextResponse.json({ success: true, date: targetDate, unique_games: gameUrls.length, logs });

  } catch (error: any) {
    return NextResponse.json({ error: error.message, logs }, { status: 500 });
  }
}