import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. マスターデータの取得 (008等のIDマッピング)
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      const cleanName = (p.player_name || '').replace(/\s+/g, '');
      playerMap.set(cleanName, p.player_id);
    });
    logs.push(`【準備】DB登録選手数: ${playerMap.size}名`);

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

    for (const teamId of teamIds) {
      // --- 野手成績同期 ---
      const bUrl = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/battingstats`;
      const bRes = await axios.get(bUrl);
      const $b = cheerio.load(bRes.data);
      const bRows = $b('.bb-statsTable__row');
      
      let bCount = 0;
      for (let i = 0; i < bRows.length; i++) {
        const row = bRows[i];
        const pLink = $b(row).find('a[href*="/player/"]');
        if (pLink.length === 0) continue;

        const pName = pLink.text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName);
        if (!correctPid) continue;

        const tds = $b(row).find('td');
        const getNum = (idx: number) => parseFloat($b(tds[idx]).text().trim()) || 0;

        await supabase.from('batting_stats').upsert({
          player_id: correctPid,
          年度: targetYear,
          名前: pName,
          安打: getNum(6),     // 安打はインデックス6
          本塁打: getNum(9),   // 本塁打はインデックス9
          打率: getNum(2),     // 打率はインデックス2
          OPS: $b(tds[22]).text().trim() || "0",
          試合: getNum(3), 打席: getNum(4), 打数: getNum(5), 打点: getNum(11)
        }, { onConflict: 'player_id, 年度' });
        bCount++;
      }

      // --- 投手成績同期 ---
      const pUrl = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/pitchingstats`;
      const pRes = await axios.get(pUrl);
      const $p = cheerio.load(pRes.data);
      const pRows = $p('.bb-statsTable__row');

      let pCount = 0;
      for (let i = 0; i < pRows.length; i++) {
        const row = pRows[i];
        const pLink = $p(row).find('a[href*="/player/"]');
        if (pLink.length === 0) continue;

        const pName = pLink.text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName);
        if (!correctPid) continue;

        const tds = $p(row).find('td');
        const getNum = (idx: number) => parseFloat($p(tds[idx]).text().trim()) || 0;

        await supabase.from('pitching_stats').upsert({
          player_id: correctPid,
          年度: targetYear,
          名前: pName,
          防御率: getNum(2),   // 防御率はインデックス2
          勝利: getNum(4),     // 勝利はインデックス4
          三振: getNum(14),    // 奪三振はインデックス14
          登板: getNum(3), 敗戦: getNum(5), 投球回: $p(tds[12]).text().trim()
        }, { onConflict: 'player_id, 年度' });
        pCount++;
      }
      logs.push(`【成功】TeamID ${teamId}: 野手${bCount}名 / 投手${pCount}名 同期完了`);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 });
  }
}