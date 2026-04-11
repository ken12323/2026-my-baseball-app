import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. 選手マスターの取得（個人ページで使っているIDをそのまま取得）
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      // 空白・全角半角を無視してマッピング
      const cleanName = (p.player_name || '').normalize('NFKC').replace(/\s+/g, '');
      playerMap.set(cleanName, p.player_id);
    });

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

    for (const teamId of teamIds) {
      const url = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/battingstats`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);

      // セレクターを Yahoo の標準的なクラスに変更
      const rows = $('tr.bb-statsTable__row');
      
      let matchedCount = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pLink = $(row).find('a[href*="/player/"]');
        if (pLink.length === 0) continue;

        const webName = pLink.text().trim().normalize('NFKC').replace(/\s+/g, '');
        const dbId = playerMap.get(webName); // 個人ページと同じIDを取得

        if (dbId) {
          const tds = $(row).find('td');
          const getNum = (idx: number) => parseFloat($(tds[idx]).text().trim()) || 0;

          // インデックス：[2]打率 [3]試合 [6]安打 [9]本塁打 [11]打点 [22]OPS
          await supabase.from('batting_stats').upsert({
            player_id: dbId, // ここが 008 等の一致するID
            年度: targetYear,
            名前: webName,
            安打: getNum(6),
            本塁打: getNum(9),
            打率: getNum(2),
            OPS: $(tds[22]).text().trim() || "0",
            試合: getNum(3),
            打席: getNum(4),
            打数: getNum(5),
            打点: getNum(11)
          }, { onConflict: 'player_id, 年度' });
          matchedCount++;
        }
      }
      logs.push(`Team ${teamId}: ${matchedCount}名を同期`);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 });
  }
}