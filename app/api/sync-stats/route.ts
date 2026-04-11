import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  // 以前教えていただいた12球団のID
  const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];

  try {
    for (const teamId of teamIds) {
      // 1. 野手通算成績の同期（個人ページの野手成績用）
      const bUrl = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/battingstats`;
      const bRes = await axios.get(bUrl);
      const $b = cheerio.load(bRes.data);

      const bRows = $b('.bb-statsTable__row');
      for (let i = 0; i < bRows.length; i++) {
        const row = bRows[i];
        const pLink = $b(row).find('a[href*="/player/"]');
        const pid = pLink.attr('href')?.match(/player\/(\d+)\//)?.[1];
        if (!pid) continue;

        const tds = $b(row).find('td');
        const getNum = (idx: number) => parseFloat($b(tds[idx]).text().trim()) || 0;

        // batting_stats テーブルを公式の通算値で更新
        await supabase.from('batting_stats').upsert({
          player_id: pid,
          年度: targetYear,
          名前: pLink.text().trim(),
          試合: getNum(1), 打席: getNum(2), 打数: getNum(3), 得点: getNum(4),
          安打: getNum(5), 二塁打: getNum(6), 三塁打: getNum(7), 本塁打: getNum(8),
          塁打: getNum(9), 打点: getNum(10), 盗塁: getNum(11), 盗塁刺: getNum(12),
          犠打: getNum(13), 犠飛: getNum(14), 四球: getNum(15), 死球: getNum(16),
          三振: getNum(17), 併殺打: getNum(18), 打率: getNum(19), 
          出塁率: getNum(20), 長打率: getNum(21), 
          OPS: $b(tds[22]).text().trim() || "0"
        }, { onConflict: 'player_id, 年度' });

        // 保存直後に、日次ログの合計と照合（Discord通知）
        await checkDataIntegrity(pid, pLink.text().trim(), getNum(5));
      }

      // 2. 投手通算成績の同期（個人ページの投手成績用）
      const pUrl = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/pitchingstats`;
      const pRes = await axios.get(pUrl);
      const $p = cheerio.load(pRes.data);

      const pRows = $p('.bb-statsTable__row');
      for (let i = 0; i < pRows.length; i++) {
        const row = pRows[i];
        const pLink = $p(row).find('a[href*="/player/"]');
        const pid = pLink.attr('href')?.match(/player\/(\d+)\//)?.[1];
        if (!pid) continue;

        const tds = $p(row).find('td');
        const getNum = (idx: number) => parseFloat($p(tds[idx]).text().trim()) || 0;

        // pitching_stats テーブルを公式の通算値で更新
        await supabase.from('pitching_stats').upsert({
          player_id: pid,
          年度: targetYear,
          名前: pLink.text().trim(),
          防御率: getNum(1), 登板: getNum(2), 勝利: getNum(3), 敗戦: getNum(4),
          セーブ: getNum(5), ホールド: getNum(6), ＨＰ: getNum(7), 完投: getNum(8),
          完封: getNum(9), 無四球: getNum(10), 投球回: $p(tds[11]).text().trim(), 
          打者: getNum(12), 三振: getNum(13), 暴投: getNum(16), ボーク: getNum(17),
          失点: getNum(18), 自責点: getNum(19)
        }, { onConflict: 'player_id, 年度' });
      }
      logs.push(`チームID ${teamId}: 2026通算同期完了`);
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// データの整合性チェック（Discord通知）
async function checkDataIntegrity(playerId: string, playerName: string, webTotalHits: number) {
  const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1492277461948567665/rfbUsaixRjbtPfAX0Z5w7aw22AtEV_xmAA-3SZ2vxWQOMG9f2myS3QgVlFBVTYkAzGo4";
  try {
    const { data } = await supabase.from('daily_performance').select('h_hits').eq('player_id', playerId).gte('date', '2026-01-01');
    const dbSumHits = data?.reduce((sum, row) => sum + Number(row.h_hits), 0) || 0;
    if (dbSumHits !== webTotalHits) {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🚨 **個人ページ用データ照合アラート**\n選手: ${playerName} (ID: ${playerId})\n公式通算: ${webTotalHits}本 / 日次ログ合計: ${dbSumHits}本\n※数値がズレています。ログの確認が必要です。`
        }),
      });
    }
  } catch (e) { console.error(e); }
}