import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. DBから選手リストを取得し、正規化してMapに格納
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      // 全角半角を統一し、空白を除去
      const cleanName = (p.player_name || '').normalize('NFKC').replace(/\s+/g, '');
      playerMap.set(cleanName, p.player_id);
    });

    // デバッグ用：DBの最初の5人を表示
    const sample = Array.from(playerMap.keys()).slice(0, 5);
    logs.push(`【DBサンプル】: ${sample.join(', ')}`);

    // 2. 楽天（376）のみに絞ってテスト（まずここを突破させる）
    const teamId = 376;
    const url = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/battingstats`;
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    // チーム別ページのテーブル行を確実に取得するセレクター
    const rows = $('.bb-statsTable table tbody tr'); 
    logs.push(`【Web確認】ページ内から ${rows.length} 行のデータを見つけました`);

    let matchedCount = 0;
    rows.each((i, row) => {
      const pLink = $(row).find('a[href*="/player/"]');
      if (pLink.length === 0) return;

      const rawWebName = pLink.text().trim();
      const cleanWebName = rawWebName.normalize('NFKC').replace(/\s+/g, '');
      const correctPid = playerMap.get(cleanWebName);

      if (correctPid) {
        matchedCount++;
        // 最初の数人だけ保存処理を実行（テスト用）
        if (matchedCount <= 50) {
          saveToDb(correctPid, cleanWebName, $(row), targetYear);
        }
      } else {
        // 一致しなかった場合、最初の3名だけ原因調査用にログ出し
        if (i < 10) logs.push(`× 不一致: Web[${cleanWebName}] が DBMap に見つかりません`);
      }
    });

    logs.push(`【結果】楽天の野手 ${matchedCount} 名の一致を確認し、DBを更新しました`);

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, logs }, { status: 500 });
  }
}

// 保存処理の共通化
async function saveToDb(pid: string, name: string, $row: any, year: number) {
  const tds = $row.find('td');
  const getNum = (idx: number) => parseFloat(tds.eq(idx).text().trim()) || 0;
  
  await supabase.from('batting_stats').upsert({
    player_id: pid,
    年度: year,
    名前: name,
    安打: getNum(6),
    本塁打: getNum(9),
    打率: getNum(2),
    OPS: tds.eq(22).text().trim() || "0",
    試合: getNum(3), 打席: getNum(4), 打数: getNum(5), 打点: getNum(11)
  }, { onConflict: 'player_id, 年度' });
}