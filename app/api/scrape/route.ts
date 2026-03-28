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
    const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`; 

    // --- 1. 試合URLの取得（より正確に） ---
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/?date=${todayStr}`;
    const { data: scheduleHtml } = await axios.get(scheduleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $sched = cheerio.load(scheduleHtml);
    
    const gameUrls: string[] = [];
    $sched('a').each((_, el) => {
      const href = $sched(el).attr('href') || '';
      // /game/数字/ という形式のURLだけを狙い撃ち
      if (href.match(/\/game\/\d+\//)) {
        const gameId = href.match(/\/game\/(\d+)\//)?.[1];
        const statsUrl = `https://baseball.yahoo.co.jp/npb/game/${gameId}/stats`;
        if (!gameUrls.includes(statsUrl)) gameUrls.push(statsUrl);
      }
    });

    // --- 2. 選手名簿の準備 ---
    const { data: allPlayers } = await supabase.from('players').select('*');
    const playerMap = new Map();
    allPlayers?.forEach(p => {
      const name = p.player_name || p.name || '';
      playerMap.set(name.replace(/\s+/g, ''), p);
    });

    const statsAggregator: Record<string, any> = {};
    const anyNamesFound: string[] = []; // デバッグ用：とにかく見つけた名前

    // --- 3. 各試合の解析（より広い範囲を検索） ---
    for (const url of gameUrls) {
      try {
        const { data: gameHtml } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const $ = cheerio.load(gameHtml);

        // テーブルの行(tr)をすべて見て、中に「/player/数字/」のリンクがあるものを探す
        $('tr').each((_, row) => {
          const playerLink = $(row).find('a[href*="/player/"]');
          if (playerLink.length > 0) {
            const nameOnPage = playerLink.first().text().trim().replace(/\s+/g, '');
            if (nameOnPage && !anyNamesFound.includes(nameOnPage)) anyNamesFound.push(nameOnPage);

            if (playerMap.has(nameOnPage)) {
              const pInfo = playerMap.get(nameOnPage);
              const cells = $(row).find('td');
              
              // Yahooの標準: 4=安打, 5=打点, 6=本塁打
              const hits = parseInt($(cells[4]).text()) || 0;
              const rbi  = parseInt($(cells[5]).text()) || 0;
              const hr   = parseInt($(cells[6]).text()) || 0;

              if (hits > 0 || hr > 0 || rbi > 0) {
                const id = pInfo.player_id || pInfo.id;
                if (!statsAggregator[id]) {
                  statsAggregator[id] = { player_id: id, player_name: nameOnPage, date: todayStr, h_hits: 0, h_hr: 0, h_rbi: 0 };
                }
                statsAggregator[id].h_hits += hits;
                statsAggregator[id].h_hr += hr;
                statsAggregator[id].h_rbi += rbi;
              }
            }
          }
        });
      } catch (e) { continue; }
    }

    const finalData = Object.values(statsAggregator);
    if (finalData.length > 0) {
      await supabase.from('daily_performance').delete().eq('date', todayStr);
      await supabase.from('daily_performance').insert(finalData);
    }

    return NextResponse.json({ 
      success: true, 
      date: todayStr, 
      games_checked: gameUrls.length, 
      matched_count: finalData.length,
      sample_names_on_page: anyNamesFound.slice(0, 15), // 見つけた名前を15人分表示
      db_player_count: allPlayers?.length || 0,
      first_game_url: gameUrls[0]
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}