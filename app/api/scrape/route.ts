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
    
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${targetDate}`;
    logs.push(`Target URL: ${scheduleUrl}`);

    const res = await axios.get(scheduleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(res.data); // ここを「$」に統一しました
    
    const gameIds = new Set<string>();
    // 型エラー防止のため :any を追加
    $('a.bb-score__content').each((_: any, el: any) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/game\/(\d+)\//);
      if (match) {
        gameIds.add(match[1]);
      }
    });

    const gameUrls = Array.from(gameIds).map(id => `https://baseball.yahoo.co.jp/npb/game/${id}/stats`);
    logs.push(`Total Games: ${gameUrls.length}`); 

    if (gameUrls.length === 0) {
      return NextResponse.json({ success: true, message: "No games found.", logs });
    }

    const { data: players } = await supabase.from('players').select('*');
    const playerMap = new Map();
    players?.forEach(p => {
      const name = (p.player_name || p.name || '').replace(/\s+/g, '');
      playerMap.set(name, p);
    });

    const statsByDate: Record<string, any> = {};

    for (const url of gameUrls) {
      try {
        const gameRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $game = cheerio.load(gameRes.data);
        const title = $game('title').text();
        const dMatch = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!dMatch) continue;
        const actualDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;

        if (!statsByDate[actualDate]) statsByDate[actualDate] = {};

        $game('.bb-statsTable').each((_: any, table: any) => {
          const ths: string[] = [];
          $game(table).find('thead th').each((__: any, th: any) => { ths.push($game(th).text().trim()); });
          
          const hitIdx = ths.indexOf('安打');
          const hrIdx  = ths.indexOf('本塁打');
          const rbiIdx = ths.indexOf('打点');

          if (hitIdx === -1 || ths.includes('防御率') || !ths.includes('打数')) return;

          $game(table).find('tr.bb-statsTable__row').each((___: any, row: any) => {
            const pLink = $game(row).find('a[href*="/player/"]');
            if (pLink.length > 0) {
              const name = pLink.text().trim().replace(/\s+/g, '');
              const pInfo = playerMap.get(name);
              if (pInfo) {
                const tds = $game(row).find('td');
                const h = parseInt($game(tds[hitIdx]).text()) || 0;
                const hr = parseInt($game(tds[hrIdx]).text()) || 0;
                const r = parseInt($game(tds[rbiIdx]).text()) || 0;

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
      } catch (err) { continue; }
    }

    for (const d of Object.keys(statsByDate)) {
      const data = Object.values(statsByDate[d]);
      await supabase.from('daily_performance').delete().eq('date', d);
      await supabase.from('daily_performance').insert(data);
    }

    return NextResponse.json({ success: true, date: targetDate, game_count: gameUrls.length, logs });

  } catch (error: any) {
    return NextResponse.json({ error: error.message, logs }, { status: 500 });
  }
}