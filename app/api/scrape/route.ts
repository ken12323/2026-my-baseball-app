import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  try {
    // --- 1. セキュリティチェック (合言葉の確認) ---
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const secretKey = process.env.CRON_SECRET;

    // 開発環境(localhost)以外で、合言葉が一致しない場合は拒否
    if (process.env.NODE_ENV === 'production' && key !== secretKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- 2. 日付を自動計算（実行時の「今日」を取得） ---
    const now = new Date();
    // 日本標準時(JST)に合わせるための補正（サーバーが海外にある場合を考慮）
    const jstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const y = jstNow.getFullYear();
    const m = String(jstNow.getMonth() + 1).padStart(2, '0');
    const d = String(jstNow.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`; 

    console.log(`[自動開始] 対象日: ${todayStr}`);

    // --- 3. 試合一覧ページから「成績URL」を自動抽出 ---
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/?date=${todayStr}`;
    const { data: scheduleHtml } = await axios.get(scheduleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    const $sched = cheerio.load(scheduleHtml);
    
    const gameUrls: string[] = [];
    $sched('a[href*="/stats"]').each((_, el) => {
      const href = $sched(el).attr('href');
      if (href) {
        const fullUrl = href.startsWith('http') ? href : `https://baseball.yahoo.co.jp${href}`;
        if (!gameUrls.includes(fullUrl)) gameUrls.push(fullUrl);
      }
    });

    if (gameUrls.length === 0) {
      return NextResponse.json({ 
        message: `対象日（${todayStr}）に終了済みの試合が見つかりませんでした。`,
        status: 'no_games_yet'
      });
    }

    // --- 4. DBから全選手情報を取得（team_nameカラムを使用） ---
    const { data: allPlayers } = await supabase
      .from('players')
      .select('player_id, player_name, high_school, team_name');

    const playerMap = new Map();
    allPlayers?.forEach(p => {
      playerMap.set(p.player_name.replace(/\s+/g, ''), p);
    });

    const statsAggregator: Record<string, any> = {};

    // --- 5. 各試合URLを巡回して解析 ---
    for (const url of gameUrls) {
      const { data: html } = await axios.get(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0' }, 
        timeout: 10000 
      });
      const $ = cheerio.load(html);

      $('.bb-statsTable').each((_, table) => {
        // 打撃成績テーブルのみを対象
        if (!$(table).find('th').text().includes('打率')) return;

        $(table).find('tr.bb-statsTable__row').each((__, row) => {
          const playerLink = $(row).find('a[href*="/player/"]');
          if (playerLink.length > 0) {
            const cleanName = playerLink.first().text().trim().replace(/\s+/g, '');
            
            if (playerMap.has(cleanName)) {
              const pInfo = playerMap.get(cleanName);
              if (!pInfo.high_school || pInfo.high_school === '未設定') return;

              const cells = $(row).find('td');
              const hits = parseInt($(cells[5]).text().trim()) || 0;
              const hr   = parseInt($(cells[13]).text().trim()) || 0;
              const rbi  = parseInt($(cells[6]).text().trim()) || 0;

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
        });
      });
    }

    const finalData = Object.values(statsAggregator);

    // --- 6. Supabaseへ保存（その日のデータを一度消してから入れる） ---
    await supabase.from('daily_performance').delete().eq('date', todayStr);
    const { error: upsertError } = await supabase.from('daily_performance').insert(finalData);

    if (upsertError) throw upsertError;

    return NextResponse.json({ 
      success: true, 
      date: todayStr,
      gamesFound: gameUrls.length,
      playerCount: finalData.length 
    });

  } catch (error: any) {
    console.error('Fatal Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}