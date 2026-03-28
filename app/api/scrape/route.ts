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

    console.log(`[取得開始] 対象日: ${todayStr}`);

    // --- 1. 試合一覧ページへアクセス ---
    // 開幕シリーズ等の特殊なURLにも対応できるよう、複数を試行
    const scheduleUrls = [
      `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${todayStr}`,
      `https://baseball.yahoo.co.jp/npb/schedule/?date=${todayStr}`
    ];

    let gameUrls: string[] = [];

    for (const sUrl of scheduleUrls) {
      try {
        const { data: html } = await axios.get(sUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $sched = cheerio.load(html);
        $sched('a[href*="/stats"]').each((_, el) => {
          const href = $sched(el).attr('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `https://baseball.yahoo.co.jp${href}`;
            if (!gameUrls.includes(fullUrl)) gameUrls.push(fullUrl);
          }
        });
        if (gameUrls.length > 0) break; // 試合が見つかればループ終了
      } catch (e) { continue; }
    }

    if (gameUrls.length === 0) {
      return NextResponse.json({ message: `試合が見つかりませんでした。`, date: todayStr });
    }

    // --- 2. DBから全選手情報を取得 ---
    const { data: allPlayers } = await supabase.from('players').select('player_id, player_name, high_school');
    const playerMap = new Map();
    allPlayers?.forEach(p => playerMap.set(p.player_name.replace(/\s+/g, ''), p));

    const statsAggregator: Record<string, any> = {};

    // --- 3. 各試合の「出場成績」を解析 ---
    for (const url of gameUrls) {
      const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(html);

      $('.bb-statsTable').each((_, table) => {
        if (!$(table).find('th').text().includes('打率')) return;

        $(table).find('tr.bb-statsTable__row').each((__, row) => {
          const playerLink = $(row).find('a[href*="/player/"]');
          if (playerLink.length > 0) {
            const cleanName = playerLink.first().text().trim().replace(/\s+/g, '');
            
            if (playerMap.has(cleanName)) {
              const pInfo = playerMap.get(cleanName);
              const cells = $(row).find('td');
              
              // Yahooの「出場成績」テーブルのインデックス（0番目から数える）
              // 0:選手 1:打率 2:打数 3:得点 4:安打 5:打点 6:本塁打
              const hits = parseInt($(cells[4]).text().trim()) || 0;
              const rbi  = parseInt($(cells[5]).text().trim()) || 0;
              const hr   = parseInt($(cells[6]).text().trim()) || 0;

              if (hits > 0 || hr > 0 || rbi > 0) {
                if (statsAggregator[pInfo.player_id]) {
                  statsAggregator[pInfo.player_id].h_hits += hits;
                  statsAggregator[pInfo.player_id].h_hr += hr;
                  statsAggregator[pInfo.player_id].h_rbi += rbi;
                } else {
                  statsAggregator[pInfo.player_id] = {
                    player_id: pInfo.player_id,
                    player_name: pInfo.player_name,
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
      });
    }

    const finalData = Object.values(statsAggregator);

    // --- 4. Supabaseへ保存 ---
    if (finalData.length > 0) {
      await supabase.from('daily_performance').delete().eq('date', todayStr);
      const { error } = await supabase.from('daily_performance').insert(finalData);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, date: todayStr, games: gameUrls.length, count: finalData.length });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}