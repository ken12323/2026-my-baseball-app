import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (process.env.NODE_ENV === 'production' && key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const todayUrlStr = `${jstNow.getFullYear()}${String(jstNow.getMonth() + 1).padStart(2, '0')}${String(jstNow.getDate()).padStart(2, '0')}`;
    
    const manualDate = searchParams.get('date')?.replace(/-/g, '');
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/?date=${manualDate || todayUrlStr}`;
    
    const { data: scheduleHtml } = await axios.get(scheduleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $sched = cheerio.load(scheduleHtml);
    
    const gameUrls: string[] = [];
    $sched('a').each((_, el) => {
      const href = $sched(el).attr('href') || '';
      if (href.match(/\/game\/\d+\//)) {
        const gameId = href.match(/\/game\/(\d+)\//)?.[1];
        const statsUrl = `https://baseball.yahoo.co.jp/npb/game/${gameId}/stats`;
        if (!gameUrls.includes(statsUrl)) gameUrls.push(statsUrl);
      }
    });

    const { data: allPlayers } = await supabase.from('players').select('*');
    const playerMap = new Map();
    allPlayers?.forEach(p => {
      const name = p.player_name || p.name || '';
      playerMap.set(name.replace(/\s+/g, ''), p);
    });

    const statsByDate: Record<string, any> = {};

    for (const url of gameUrls) {
      try {
        const { data: gameHtml } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const $ = cheerio.load(gameHtml);

        // 【改良】タブのタイトル（<title>タグ）から日付を抽出
        // 例: "2026年3月27日 オリックス・バファローズ対..."
        const pageTitle = $('title').text();
        const dateMatch = pageTitle.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        
        if (!dateMatch) continue;

        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        const gameDate = `${year}-${month}-${day}`; // 正確な YYYY-MM-DD

        if (!statsByDate[gameDate]) statsByDate[gameDate] = {};

        $('.bb-statsTable').each((_, table) => {
          const tableHeader = $(table).find('thead').text();
          if (tableHeader.includes('防御率') || !tableHeader.includes('打数')) return;

          $(table).find('tr.bb-statsTable__row').each((__, row) => {
            const playerLink = $(row).find('a[href*="/player/"]');
            if (playerLink.length > 0) {
              const nameOnPage = playerLink.first().text().trim().replace(/\s+/g, '');
              if (playerMap.has(nameOnPage)) {
                const pInfo = playerMap.get(nameOnPage);
                const cells = $(row).find('td');
                const hits = parseInt($(cells[4]).text()) || 0;
                const rbi  = parseInt($(cells[5]).text()) || 0;
                const hr   = parseInt($(cells[6]).text()) || 0;

                if (hits > 0 || hr > 0 || rbi > 0) {
                  const id = pInfo.player_id || pInfo.id;
                  if (!statsByDate[gameDate][id]) {
                    statsByDate[gameDate][id] = { player_id: id, player_name: nameOnPage, date: gameDate, h_hits: 0, h_hr: 0, h_rbi: 0 };
                  }
                  statsByDate[gameDate][id].h_hits += hits;
                  statsByDate[gameDate][id].h_hr += hr;
                  statsByDate[gameDate][id].h_rbi += rbi;
                }
              }
            }
          });
        });
      } catch (e) { continue; }
    }

    let totalInserted = 0;
    const datesProcessed = Object.keys(statsByDate);

    for (const d of datesProcessed) {
      const finalData = Object.values(statsByDate[d]);
      if (finalData.length > 0) {
        await supabase.from('daily_performance').delete().eq('date', d);
        await supabase.from('daily_performance').insert(finalData);
        totalInserted += finalData.length;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed_dates: datesProcessed,
      total_count: totalInserted,
      method: "Extracted from page title (YYYY年MM月DD日)"
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}