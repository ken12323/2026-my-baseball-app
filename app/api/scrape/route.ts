import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Yahoo! JAPAN プロ野球の試合詳細ページから個人成績をスクレイピングし、
 * Supabase の daily_performance テーブルに保存します。
 */
export async function GET(request: Request) {
  const logs: string[] = [];

  try {
    // 1. 認証チェック
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const isProd = process.env.NODE_ENV === 'production';
    
    if (isProd && key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 日付設定（日本標準時）
    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || jstNow.toISOString().split('T')[0];
    const targetYear = parseInt(targetDate.split('-')[0]);
    
    // Yahoo! スケジュールページ
    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${targetDate}`;
    logs.push(`アクセス先: ${scheduleUrl}`);

    // 3. 試合一覧の取得
    const res = await axios.get(scheduleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });

    const $ = cheerio.load(res.data);
    const gameIds = new Set<string>();

    // 1軍の試合リンク（.bb-score a.bb-score__content）を抽出
    $('.bb-score a.bb-score__content').each((_: any, el: any) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/game\/(\d+)\//);
      if (match) gameIds.add(match[1]);
    });

    const gameUrls = Array.from(gameIds).map(id => `https://baseball.yahoo.co.jp/npb/game/${id}/stats`);
    logs.push(`見つかった試合数: ${gameUrls.length}`);

    if (gameUrls.length === 0) {
      return NextResponse.json({ success: true, message: "試合が見つかりませんでした。", logs });
    }

    // 4. 選手名簿の取得（名前解決用）
    const { data: players } = await supabase.from('players').select('*');
    const playerMap = new Map();
    players?.forEach(p => {
      const name = (p.player_name || p.name || '').replace(/\s+/g, '');
      playerMap.set(name, p);
    });

    const statsByDate: Record<string, any> = {};

    // 5. 各試合のスタッツ（個人成績）を解析
    for (const url of gameUrls) {
      try {
        const gameRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $game = cheerio.load(gameRes.data);
        
        const title = $game('title').text();
        const dMatch = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!dMatch) continue;
        const actualDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;

        if (!statsByDate[actualDate]) statsByDate[actualDate] = {};

        // 成績テーブル（打撃・投手）をループ
        $game('.bb-statsTable').each((_: any, table: any) => {
          const ths: string[] = [];
          $game(table).find('thead th').each((__: any, th: any) => { ths.push($game(th).text().trim()); });
          
          const getIdx = (name: string) => ths.indexOf(name);
          const isPitcherTable = ths.includes('防御率') || ths.includes('回数');
          const isBatterTable = ths.includes('打数') && !isPitcherTable;

          if (!isPitcherTable && !isBatterTable) return;

          $game(table).find('tr.bb-statsTable__row').each((___: any, row: any) => {
            const pLink = $game(row).find('a[href*="/player/"]');
            if (pLink.length === 0) return;

            const playerName = pLink.text().trim().replace(/\s+/g, '');
            const pInfo = playerMap.get(playerName);
            if (!pInfo) return; // DBに登録されていない選手はスキップ

            const tds = $game(row).find('td');
            const val = (i: number) => i !== -1 ? ($game(tds[i]).text().trim()) : null;
            const num = (i: number) => {
              const v = val(i);
              if (!v || v === '-') return 0;
              return v.includes('.') ? parseFloat(v) : parseInt(v);
            };

            const id = pInfo.player_id || pInfo.id;
            
            // データ格納オブジェクトの初期化
            if (!statsByDate[actualDate][id]) {
              statsByDate[actualDate][id] = { 
                player_id: id, player_name: playerName, date: actualDate,
                h_hits: 0, h_hr: 0, h_rbi: 0,
                名前: playerName, 年度: targetYear, 
                試合: 1, 打席: 0, 打数: 0, 得点: 0, 安打: 0, 二塁打: 0, 三塁打: 0, 本塁打: 0, 塁打: 0, 打点: 0, 
                盗塁: 0, 盗塁刺: 0, 犠打: 0, 犠飛: 0, 四球: 0, 死球: 0, 三振: 0, 併殺打: 0,
                打率: 0, 長打率: 0, 出塁率: 0, OPS: "0",
                登板: 0, 勝利: 0, 敗戦: 0, セーブ: 0, ホールド: 0, HP: 0, 完投: 0, 完封: 0, 無四球: 0, 
                打者: 0, 投球回: "0", 暴投: 0, ボーク: 0, 失点: 0, 自責点: 0, 防御率: 0
              };
            }

            const s = statsByDate[actualDate][id];

            if (isBatterTable) {
              s.打席 += num(getIdx('打席'));
              s.打数 += num(getIdx('打数'));
              s.安打 += num(getIdx('安打'));
              s.h_hits = s.安打;
              s.二塁打 += num(getIdx('二塁打'));
              s.三塁打 += num(getIdx('三塁打'));
              s.本塁打 += num(getIdx('本塁打'));
              s.h_hr = s.本塁打;
              s.打点 += num(getIdx('打点'));
              s.h_rbi = s.打点;
              s.得点 += num(getIdx('得点'));
              s.三振 += num(getIdx('三振'));
              s.四球 += num(getIdx('四球'));
              s.死球 += num(getIdx('死球'));
              s.犠打 += num(getIdx('犠打'));
              s.犠飛 += num(getIdx('犠飛'));
              s.盗塁 += num(getIdx('盗塁'));
              s.盗塁刺 += num(getIdx('盗塁刺'));
              s.併殺打 += num(getIdx('併殺打'));
              s.打率 = num(getIdx('打率'));
              s.長打率 = num(getIdx('長打率'));
              s.出塁率 = num(getIdx('出塁率'));
              s.OPS = val(getIdx('OPS')) || "0";
              s.塁打 += num(getIdx('塁打'));
            } else if (isPitcherTable) {
              s.登板 = 1;
              s.勝利 += num(getIdx('勝利'));
              s.敗戦 += num(getIdx('敗戦'));
              s.セーブ += num(getIdx('セーブ'));
              s.ホールド += num(getIdx('ホールド'));
              s.HP += num(getIdx('ＨＰ'));
              s.完投 += num(getIdx('完投'));
              s.完封 += num(getIdx('完封'));
              s.無四球 += num(getIdx('無四球'));
              s.打者 += num(getIdx('打者'));
              s.投球回 = val(getIdx('回数')) || val(getIdx('投球回')) || "0";
              s.失点 += num(getIdx('失点'));
              s.自責点 += num(getIdx('自責点'));
              s.防御率 = num(getIdx('防御率'));
            }
          });
        });
      } catch (err) {
        logs.push(`エラー解析 ${url}: ${err}`);
        continue;
      }
    }

    // 6. DB更新
    for (const d of Object.keys(statsByDate)) {
      const data = Object.values(statsByDate[d]);
      await supabase.from('daily_performance').delete().eq('date', d);
      const { error: insertError } = await supabase.from('daily_performance').insert(data);
      if (insertError) throw insertError;

      // ★【ここに追加】保存が終わったあとに整合性チェックを呼び出す
      for (const item of data as any[]) {
        // webTotalHitsには暫定的に item.安打 を渡していますが、
        // 本来はスポナビの「通算安打」の数値をスクレイピングして渡すのが正解です。
        await checkDataIntegrity(item.player_id, item.player_name, item.安打);
      }
    }

    return NextResponse.json({ success: true, date: targetDate, game_count: gameUrls.length, logs });

  } catch (error: any) {
    console.error("Critical Error:", error);
    return NextResponse.json({ error: error.message, logs }, { status: 500 });
  }
}

// --- 以下、監視用関数本体 ---
async function checkDataIntegrity(playerId: string, playerName: string, webTotalHits: number) {
  const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1492277461948567665/rfbUsaixRjbtPfAX0Z5w7aw22AtEV_xmAA-3SZ2vxWQOMG9f2myS3QgVlFBVTYkAzGo4";

  try {
    const { data: dailyData, error: dbError } = await supabase
      .from('daily_performance')
      .select('h_hits')
      .eq('player_id', playerId)
      .gte('date', '2026-01-01');

    if (dbError) throw dbError;

    const dbSumHits = dailyData?.reduce((sum: number, row: any) => sum + Number(row.h_hits), 0) || 0;

    if (dbSumHits !== webTotalHits) {
      const diff = webTotalHits - dbSumHits;
      
      const message = {
        content: `🚨 **データ不整合を検知しました**\n` +
                 `選手名: **${playerName}** (ID: ${playerId})\n` +
                 `----------------------------------\n` +
                 `公式(Web)の通算: ${webTotalHits}本\n` +
                 `DB内の日次合計: ${dbSumHits}本\n` +
                 `差分: ${diff > 0 ? '+' : ''}${diff}本\n` +
                 `----------------------------------\n` +
                 `👉 daily_performanceテーブルを確認してください。`
      };

      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    }
  } catch (err) {
    console.error('❌ 照合システムエラー:', err);
  }
}