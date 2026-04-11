import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. マスターデータの確認
    const { data: playerMaster, error: masterError } = await supabase.from('players').select('player_id, player_name');
    if (masterError) throw new Error(`Master Fetch Error: ${masterError.message}`);
    
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      const cleanName = (p.player_name || '').replace(/\s+/g, '');
      playerMap.set(cleanName, p.player_id);
    });
    logs.push(`DB登録選手数: ${playerMap.size}名`);

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

    for (const teamId of teamIds) {
      let matchedInTeam = 0;
      // Yahooはリダイレクトするため、直接 stats/batter を叩くのが確実です
      const url = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/stats/batter`;
      const res = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(res.data);

      const rows = $('.bb-statsTable__row'); // tbody内の行
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pLink = $(row).find('a[href*="/player/"]');
        if (pLink.length === 0) continue;

        const pName = pLink.text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName);

        if (!correctPid) {
          // logs.push(`× 不一致: ${pName} (DBに存在しません)`);
          continue;
        }

        const tds = $(row).find('td');
        const getVal = (idx: number) => $(tds[idx]).text().trim();
        const getNum = (idx: number) => parseFloat(getVal(idx)) || 0;

        // 【デバッグ済】チーム別野手成績テーブルのインデックス
        // [2]打率 [3]試合 [4]打席 [5]打数 [6]安打 [9]本塁打 [11]打点 [22]OPS
        const hits = getNum(6);
        const { error: upsertError } = await supabase.from('batting_stats').upsert({
          player_id: correctPid,
          年度: targetYear,
          名前: pName,
          安打: hits,
          本塁打: getNum(9),
          打率: getNum(2),
          OPS: getVal(22) || "0",
          試合: getNum(3),
          打席: getNum(4),
          打数: getNum(5),
          打点: getNum(11)
        }, { onConflict: 'player_id, 年度' });

        if (upsertError) {
          logs.push(`!! 保存失敗: ${pName} (${upsertError.message})`);
        } else {
          matchedInTeam++;
        }
      }
      logs.push(`Team ${teamId}: ${matchedInTeam}名のデータを同期しました`);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 });
  }
}