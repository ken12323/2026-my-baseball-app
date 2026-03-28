import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const secretKey = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === 'production' && key !== secretKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const y = jstNow.getFullYear();
    const m = String(jstNow.getMonth() + 1).padStart(2, '0');
    const d = String(jstNow.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`; 

    // --- 1. 試合一覧ページからURLを根こそぎ拾う ---
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/?date=${todayStr}`;
    const { data: html } = await axios.get(scheduleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $sched = cheerio.load(html);
    
    const gameUrls: string[] = [];
    // 「/stats」だけでなく「game/」を含むリンクをすべて対象にする
    $sched('a[href*="/game/"]').each((_, el) => {
      const href = $sched(el).attr('href') || '';
      const fullUrl = href.startsWith('http') ? href : `https://baseball.yahoo.co.jp${href}`;
      // 重複を除去しつつ、末尾を「stats」に固定
      const statsUrl = fullUrl.split('?')[0].replace(/\/$/, '') + '/stats';
      if (!gameUrls.includes(statsUrl)) gameUrls.push(statsUrl);
    });

    // --- 2. DBから全選手情報を取得（カラム名が name か player_name 両方に対応） ---
    const { data: allPlayers } = await supabase.from('players').select('*');
    const playerMap = new Map();
    allPlayers?.forEach(p => {
      // name または player_name どちらかある方を使う
      const nameInDb = p.player_name || p.name || '';
      playerMap.set(nameInDb.replace(/\s+/g, ''), p);
    });

    const statsAggregator: Record<string, any> = {};
    const debugNamesFound: string[] = []; // デバッグ用

    // --- 3. 各試合を解析 ---
    for (const url of gameUrls) {
      try {
        const { data: gameHtml } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const $ = cheerio.load(gameHtml);

        $('.bb-statsTable tr.bb-statsTable__row').each((_, row) => {
          const nameEl = $(row).find('a[href*="/player/"]');
          if (nameEl.length > 0) {
            const nameOnPage = nameEl.text().trim().replace(/\s+/g, '');
            debugNamesFound.push(nameOnPage); // 見つけた名前をメモ

            if (playerMap.has(nameOnPage)) {
              const pInfo = playerMap.get(nameOnPage);
              const cells = $(row).find('td');
              
              // カラム位置: 安打(4), 打点(5), 本塁打(6) ※Yahooの標準形式
              const hits = parseInt($(cells[4]).text()) || 0;
              const rbi  = parseInt($(cells[5]).text()) || 0;
              const hr   = parseInt($(cells[6]).text()) || 0;

              if (hits > 0 || hr > 0 || rbi > 0) {
                const id = pInfo.player_id || pInfo.id;
                if (statsAggregator[id]) {
                  statsAggregator[id].h_hits += hits;
                  statsAggregator[id].h_hr += hr;
                  statsAggregator[id].h_rbi += rbi;
                } else {
                  statsAggregator[id] = {
                    player_id: id,
                    player_name: pInfo.player_name || pInfo.name,
                    date: todayStr,
                    h_hits: hits,
                    h_hr: hr,
                    h_rbi: rbi
                  };
                }
              }
            }
          }
        });
      } catch (e) { continue; }
    }

    const finalData = Object.values(statsAggregator);

    // --- 4. 保存 ---
    if (finalData.length > 0) {
      await supabase.from('daily_performance').delete().eq('date', todayStr);
      await supabase.from('daily_performance').insert(finalData);
    }

    return NextResponse.json({ 
      success: true, 
      date: todayStr, 
      games: gameUrls.length, 
      count: finalData.length,
      debug_first_10_names_on_page: debugNamesFound.slice(0, 10), // 最初の10人だけ表示
      db_player_count: allPlayers?.length || 0
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}