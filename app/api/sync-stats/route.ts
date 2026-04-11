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
      // --- 野手成績 ---
      const bRes = await axios.get(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/battingstats`);
      const $b = cheerio.load(bRes.data);

      const bRows = $b('.bb-statsTable__row');
      for (let i = 0; i < bRows.length; i++) {
        const row = bRows[i];
        const pName = $b(row).find('a[href*="/player/"]').text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName); // 名前からID(008等)を取得
        
        if (!correctPid) continue; // DBにいない選手は無視

        const tds = $b(row).find('td');
        const getNum = (idx: number) => parseFloat($b(tds[idx]).text().trim()) || 0;

        await supabase.from('batting_stats').upsert({
          player_id: correctPid, // ここを管理IDにする
          年度: targetYear,
          名前: pName,
          安打: getNum(5),
          本塁打: getNum(8),
          打率: getNum(19),
          OPS: $b(tds[22]).text().trim() || "0",
          試合: getNum(1), 打席: getNum(2), 打数: getNum(3), 打点: getNum(10), 三振: getNum(17)
        }, { onConflict: 'player_id, 年度' });
      }

      // --- 投手成績 ---
      const pRes = await axios.get(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/pitchingstats`);
      const $p = cheerio.load(pRes.data);

      const pRows = $p('.bb-statsTable__row');
      for (let i = 0; i < pRows.length; i++) {
        const row = pRows[i];
        const pName = $p(row).find('a[href*="/player/"]').text().trim().replace(/\s+/g, '');
        const correctPid = playerMap.get(pName);

        if (!correctPid) continue;

        const tds = $p(row).find('td');
        const getNum = (idx: number) => parseFloat($p(tds[idx]).text().trim()) || 0;

        await supabase.from('pitching_stats').upsert({
          player_id: correctPid,
          年度: targetYear,
          名前: pName,
          防御率: getNum(1),
          勝利: getNum(3),
          三振: getNum(13),
          登板: getNum(2), 敗戦: getNum(4), 投球回: $p(tds[11]).text().trim()
        }, { onConflict: 'player_id, 年度' });
      }
      logs.push(`Team ${teamId} Synced`);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}