import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const logs: string[] = [];
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    //if (process.env.NODE_ENV === 'production' && key !== process.env.CRON_SECRET) {
   //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    //}

    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const targetDate = searchParams.get('date') || jstNow.toISOString().split('T')[0];
    const targetYear = parseInt(targetDate.split('-')[0]);

    const scheduleUrl = `https://baseball.yahoo.co.jp/npb/schedule/first/all?date=${targetDate}`;
    const res = await axios.get(scheduleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    const gameIds: string[] = [];
    $('.bb-score a.bb-score__content').each((_, el) => {
      const match = $(el).attr('href')?.match(/\/game\/(\d+)\//);
      if (match) gameIds.push(match[1]);
    });

    const { data: players } = await supabase.from('players').select('*');
    const playerMap = new Map();
    players?.forEach(p => {
      // ★修正1: 名前の正規化（NFKC）を行い、空白を消去してマップ化
      const cleanName = (p.player_name || '').normalize('NFKC').replace(/\s+/g, '');
      playerMap.set(cleanName, p);
    });

    const statsByDate: Record<string, any> = {};

    for (const id of gameIds) {
      const gameRes = await axios.get(`https://baseball.yahoo.co.jp/npb/game/${id}/stats`);
      const $game = cheerio.load(gameRes.data);
      
      $game('.bb-statsTable').each((_, table) => {
        const ths: string[] = [];
        $game(table).find('thead th').each((__, th) => { ths.push($game(th).text().trim()); });
        const isP = ths.includes('防御率');
        const isB = ths.includes('打数') && !isP;
        if (!isP && !isB) return;

        $game(table).find('tr.bb-statsTable__row').each((___, row) => {
          // ★修正1: スポナビ側の名前も正規化して空白を消去
          const rawName = $game(row).find('a[href*="/player/"]').text().trim();
          const name = rawName.normalize('NFKC').replace(/\s+/g, '');
          
          const pInfo = playerMap.get(name);
          if (!pInfo) return; // 紐付かない場合はスキップ

          // ★修正2: 確実に8桁の文字列IDにする
          const safePid = String(pInfo.player_id).padStart(8, '0');
          
          if (!statsByDate[targetDate]) statsByDate[targetDate] = {};
          if (!statsByDate[targetDate][safePid]) {
            statsByDate[targetDate][safePid] = { 
              player_id: safePid, 
              player_name: name, 
              date: targetDate, 
              h_hits: 0, 
              h_hr: 0, 
              h_rbi: 0, 
              名前: name, 
              年度: targetYear 
            };
          }
          
          const s = statsByDate[targetDate][safePid];
          const tds = $game(row).find('td');
          const num = (n: string) => parseInt($game(tds[ths.indexOf(n)]).text().trim()) || 0;

          if (isB) {
            s.h_hits += num('安打');
            s.h_hr += num('本塁打');
            s.h_rbi += num('打点'); // （おまけ）打点も集計項目にあるようなので追加
          }
        });
      });
    }

    for (const d of Object.keys(statsByDate)) {
      const data = Object.values(statsByDate[d]);
      if (data.length > 0) {
        await supabase.from('daily_performance').delete().eq('date', d);
        await supabase.from('daily_performance').insert(data);
      }
    }

    return NextResponse.json({ success: true, logs: [`${targetDate} の日次データを更新しました (選手数: ${statsByDate[targetDate] ? Object.keys(statsByDate[targetDate]).length : 0})`] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}