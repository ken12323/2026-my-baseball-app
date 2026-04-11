import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. DBから「01005134」形式のIDをそのまま取得
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      const cleanName = (p.player_name || '').replace(/\s+/g, ''); // 空白除去
      playerMap.set(cleanName, p.player_id); // player_idは文字列のまま
    });

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

    for (const teamId of teamIds) {
      // 野手・投手の順にページを回す
      const types = [
        { suffix: 'battingstats', isP: false },
        { suffix: 'pitchingstats', isP: true }
      ];

      for (const t of types) {
        const url = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/${t.suffix}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);

        // チーム別成績ページのテーブルから、選手リンクがある行だけを抽出
        const rows = $('table tr').filter((_, el) => $(el).find('a[href*="/player/"]').length > 0);
        let count = 0;

        rows.each((_, row) => {
          const pLink = $(row).find('a[href*="/player/"]');
          const webName = pLink.text().trim().replace(/\s+/g, '');
          const correctPid = playerMap.get(webName); // DBの ID (01005134等) と合致

          if (correctPid) {
            const tds = $(row).find('td');
            const getNum = (idx: number) => parseFloat(tds.eq(idx).text().trim()) || 0;

            if (!t.isP) {
              // 野手保存
              supabase.from('batting_stats').upsert({
                player_id: correctPid,
                年度: targetYear,
                名前: webName,
                安打: getNum(6), 本塁打: getNum(9), 打率: getNum(2),
                OPS: tds.eq(22).text().trim() || "0",
                試合: getNum(3), 打席: getNum(4), 打数: getNum(5), 打点: getNum(11)
              }, { onConflict: 'player_id, 年度' }).then();
            } else {
              // 投手保存
              supabase.from('pitching_stats').upsert({
                player_id: correctPid,
                年度: targetYear,
                名前: webName,
                防御率: getNum(2), 勝利: getNum(4), 三振: getNum(17),
                登板: getNum(3), 敗戦: getNum(5), 投球回: tds.eq(11).text().trim()
              }, { onConflict: 'player_id, 年度' }).then();
            }
            count++;
          }
        });
        logs.push(`Team ${teamId} ${t.suffix}: ${count}名同期`);
      }
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 });
  }
}