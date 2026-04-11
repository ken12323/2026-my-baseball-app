import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      const cleanName = (p.player_name || '').replace(/\s+/g, '');
      playerMap.set(cleanName, p.player_id);
    });

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

    for (const teamId of teamIds) {
      const types = [{ s: 'battingstats', isP: false }, { s: 'pitchingstats', isP: true }];

      for (const t of types) {
        const url = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/${t.s}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);

        // 列のタイトルを取得してインデックスを特定
        const headers: string[] = [];
        $('table thead th').each((_, th) => { headers.push($(th).text().trim()); });

        const getIdx = (name: string) => headers.indexOf(name);
        const rows = $('table tbody tr');
        let count = 0;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const pLink = $(row).find('a[href*="/player/"]');
          if (pLink.length === 0) continue;

          const webName = pLink.text().trim().replace(/\s+/g, '');
          const correctPid = playerMap.get(webName);
          if (!correctPid) continue;

          const tds = $(row).find('td');
          const val = (name: string) => {
            const idx = getIdx(name);
            return idx !== -1 ? $(tds[idx]).text().trim() : "0";
          };
          const num = (name: string) => parseFloat(val(name)) || 0;

          if (!t.isP) {
            // 野手：個人ページと同じ batting_stats テーブルを更新
            await supabase.from('batting_stats').upsert({
              player_id: correctPid, // 01005134 形式
              年度: targetYear,
              名前: webName,
              安打: num('安打'),
              本塁打: num('本塁打'),
              打率: num('打率'),
              OPS: val('OPS'),
              試合: num('試合'),
              打数: num('打数'),
              打点: num('打点')
            }, { onConflict: 'player_id, 年度' });
          } else {
            // 投手：pitching_stats テーブルを更新
            await supabase.from('pitching_stats').upsert({
              player_id: correctPid,
              年度: targetYear,
              名前: webName,
              防御率: num('防御率'),
              勝利: num('勝利'),
              三振: num('三振'),
              登板: num('登板'),
              敗戦: num('敗戦'),
              投球回: val('投球回') || val('回数')
            }, { onConflict: 'player_id, 年度' });
          }
          count++;
        }
        logs.push(`Team ${teamId} ${t.s}: ${count}名同期`);
      }
    }
    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 });
  }
}