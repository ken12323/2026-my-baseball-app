import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

// チームIDと表示用球団名のマッピング
const TEAM_NAME_MAP: Record<number, string> = {
  1: '阪神タイガース', 2: '読売ジャイアンツ', 3: '横浜DeNAベイスターズ', 
  4: '中日ドラゴンズ', 5: '東京ヤクルトスワローズ', 6: '広島東洋カープ', 
  7: '東北楽天ゴールデンイーグルス', 8: '千葉ロッテマリーンズ', 
  9: '北海道日本ハムファイターズ', 11: '埼玉西武ライオンズ', 
  12: 'オリックス・バファローズ', 376: '福岡ソフトバンクホークス'
};

export async function GET(request: Request) {
  const logs: string[] = [];
  const targetYear = 2026;

  try {
    // 1. 選手マスターの取得と正規化
    const { data: playerMaster } = await supabase.from('players').select('player_id, player_name');
    
    // 名前の空白を完全に除去して Map を作成（「筒香　嘉智」を「筒香嘉智」として保持）
    const playerMap = new Map();
    playerMaster?.forEach(p => {
      const cleanName = (p.player_name || '').normalize('NFKC').replace(/\s+/g, '');
      // すでに登録されている場合は、最初に見つかったID（本来のID）を優先
      if (!playerMap.has(cleanName)) {
        playerMap.set(cleanName, String(p.player_id).padStart(8, '0'));
      }
    });

    const teamIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 376];
    
    for (const teamId of teamIds) {
      const teamName = TEAM_NAME_MAP[teamId] || '不明';
      const types = [{ s: 'battingstats', isP: false }, { s: 'pitchingstats', isP: true }];
      
      for (const t of types) {
        const url = `https://baseball.yahoo.co.jp/npb/teams/${teamId}/${t.s}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);

        // ヘッダーの正規化（「三　振」「ＯＰＳ」対策）
        const headers: string[] = [];
        $('table thead th').each((_, th) => {
          headers.push($(th).text().normalize('NFKC').replace(/\s+/g, ''));
        });

        const getIdx = (name: string) => headers.indexOf(name);
        const rows = $('table tbody tr');

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const pLink = $(row).find('a[href*="/player/"]');
          if (pLink.length === 0) continue;

          // スクレイピング元の名前から空白を除去して正規化
          const webName = pLink.text().trim().normalize('NFKC').replace(/\s+/g, '');
          let correctPid = playerMap.get(webName);
          
          if (!correctPid) {
            // マスターに存在しない名前の場合はスキップ（不正なIDの生成を防止）
            continue;
          }

          // ★鉄則：IDを確実に8桁の文字列にする（0落ち防止）
          const safePid = String(correctPid).padStart(8, '0');

          const tds = $(row).find('td');
          const val = (name: string) => {
            const idx = getIdx(name);
            return idx !== -1 ? $(tds[idx]).text().trim() : "0";
          };
          const num = (name: string) => parseFloat(val(name)) || 0;

          if (!t.isP) {
            // 野手：既存のWAR（計算値）を守るため、upsert時に上書きする項目を限定
            await supabase.from('batting_stats').upsert({
              player_id: safePid,
              年度: targetYear,
              名前: webName,
              所属球団: teamName, // NULL重複防止
              安打: num('安打'), 
              本塁打: num('本塁打'), 
              打率: num('打率'),
              OPS: val('OPS'), 
              三振: num('三振'),
              打点: num('打点'), 
              試合: num('試合'), 
              打数: num('打数'), 
              打席: num('打席')
            }, { onConflict: 'player_id, 年度' });
          } else {
            // 投手：既存の投手WARを保護
            await supabase.from('pitching_stats').upsert({
              player_id: safePid,
              年度: targetYear,
              名前: webName,
              所属球団: teamName, // NULL重複防止
              防御率: num('防御率'), 
              勝利: num('勝利'), 
              三振: num('三振'), 
              登板: num('登板'), 
              敗戦: num('敗戦'), 
              投球回: val('投球回') || val('回数'),
              四球: num('四球'),
              死球: num('死球'),
              本塁打: num('本塁打'),
              自責点: num('自責点')
            }, { onConflict: 'player_id, 年度' });
          }
        }
        logs.push(`Team ${teamId} (${teamName}) ${t.s} Synced`);
      }
    }
    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}