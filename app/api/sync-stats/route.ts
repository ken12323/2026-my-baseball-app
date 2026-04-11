import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. 名前から正しいID(008等)を引くためのマッピング作成
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      const cleanName = (p.player_name || '').replace(/\s+/g, '');
      playerMap.set(cleanName, p.player_id);
    });

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

    for (const teamId of teamIds) {
      // --- 野手成績の同期 ---
      const bRes = await axios.get(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/battingstats`);
      const $b = cheerio.load(bRes.data);

      const bRows = $b('.bb-statsTable__row');
      for (let i = 0; i < bRows.length; i++) {
        const row = bRows[i];
        const pName = $b(row).find('a[href*="/player/"]').text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName);
        
        if (!correctPid) continue;

        const tds = $b(row).find('td');
        const getVal = (idx: number) => $b(tds[idx]).text().trim();
        const getNum = (idx: number) => parseFloat(getVal(idx)) || 0;

        /**
         * チーム別打撃成績テーブルのインデックス（デバッグ済み）
         * [2]打率 [3]試合 [4]打席 [5]打数 [6]安打 [9]本塁打 [11]打点 [18]三振 [22]OPS
         */
        await supabase.from('batting_stats').upsert({
          player_id: correctPid,
          年度: targetYear,
          名前: pName,
          安打: getNum(6),     // 安打は 6
          本塁打: getNum(9),   // 本塁打は 9
          打率: getNum(2),     // 打率は 2
          OPS: getVal(22) || "0", // OPSは 22
          試合: getNum(3),
          打席: getNum(4),
          打数: getNum(5),
          打点: getNum(11),
          三振: getNum(18)
        }, { onConflict: 'player_id, 年度' });

        // 保存直後に、日次ログの合計と照合（Discord通知）
        await checkDataIntegrity(correctPid, pName, getNum(6));
      }

      // --- 投手成績の同期 ---
      const pRes = await axios.get(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/pitchingstats`);
      const $p = cheerio.load(pRes.data);

      const pRows = $p('.bb-statsTable__row');
      for (let i = 0; i < pRows.length; i++) {
        const row = pRows[i];
        const pName = $p(row).find('a[href*="/player/"]').text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName);

        if (!correctPid) continue;

        const tds = $p(row).find('td');
        const getVal = (idx: number) => $p(tds[idx]).text().trim();
        const getNum = (idx: number) => parseFloat(getVal(idx)) || 0;

        /**
         * チーム別投手成績テーブルのインデックス（デバッグ済み）
         * [2]防御率 [3]登板 [4]勝利 [5]敗戦 [11]投球回 [17]三振
         */
        await supabase.from('pitching_stats').upsert({
          player_id: correctPid,
          年度: targetYear,
          名前: pName,
          防御率: getNum(2),
          勝利: getNum(4),
          三振: getNum(17),
          登板: getNum(3),
          敗戦: getNum(5),
          投球回: getVal(11)
        }, { onConflict: 'player_id, 年度' });
      }
      logs.push(`Team ${teamId} Synced`);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function checkDataIntegrity(playerId: string, playerName: string, webTotalHits: number) {
  const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1492277461948567665/rfbUsaixRjbtPfAX0Z5w7aw22AtEV_xmAA-3SZ2vxWQOMG9f2myS3QgVlFBVTYkAzGo4";
  try {
    const { data } = await supabase.from('daily_performance').select('h_hits').eq('player_id', playerId).gte('date', '2026-01-01');
    const dbSumHits = data?.reduce((sum: number, row: any) => sum + Number(row.h_hits), 0) || 0;
    if (dbSumHits !== webTotalHits) {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🚨 **不整合検知**: ${playerName} (ID: ${playerId})\n公式通算: ${webTotalHits}本 / DBログ合計: ${dbSumHits}本`
        }),
      });
    }
  } catch (e) { console.error(e); }
}