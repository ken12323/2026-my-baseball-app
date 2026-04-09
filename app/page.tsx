'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// --- 1. 型定義 ---
type Period = 'today' | 'yesterday' | 'weekly' | 'season';
type Category = 'high_school' | 'university' | 'prev_team' | 'draft_year' | 'hometown';

interface PlayerSummary {
  id: any;
  name: string;
  hits: number;
  hr: number;
  team: string;
}

interface RankingRow {
  name: string;
  total_hits: number;
  total_hr: number;
  total_rbi: number;
  players: PlayerSummary[];
}

const CATEGORY_URL_MAP: Record<string, string> = {
  high_school: 'high_school',
  university: 'university',
  prev_team: 'previous_team',
  draft_year: 'draft',
  hometown: 'hometown'
};

// --- 2. メインのロジック部分 ---
function RankingList() {
  const searchParams = useSearchParams();
  const period = (searchParams.get('period') as Period) || 'today';
  const category = (searchParams.get('cat') as Category) || 'high_school';

  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayDate, setDisplayDate] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const getJSTDate = (offsetDay = 0) => {
          const d = new Date();
          d.setDate(d.getDate() + offsetDay);
          return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
        };

        const todayStr = getJSTDate(0);
        const yesterdayStr = getJSTDate(-1);
        const weekAgoStr = getJSTDate(-7);

        let targetQueryDate = todayStr;
        if (period === 'yesterday') targetQueryDate = yesterdayStr;
        setDisplayDate(period === 'season' ? '2026年 通算' : targetQueryDate);

        let query = supabase.from('daily_performance').select('*');
        if (period === 'today') query = query.eq('date', todayStr);
        else if (period === 'yesterday') query = query.eq('date', yesterdayStr);
        else if (period === 'weekly') query = query.gte('date', weekAgoStr);

        const [{ data: performance }, { data: playersData }] = await Promise.all([
          query,
          supabase.from('players').select('*')
        ]);

        const stats: Record<string, RankingRow> = {};
        if (performance && playersData) {
          performance.forEach((perf) => {
            const player = playersData.find((p) => String(p.player_id) === String(perf.player_id));
            if (!player) return;

            let keys: string[] = [];
            if (category === 'high_school') keys.push(player.high_school || '海外/その他');
            else if (category === 'university' && player.university) keys.push(player.university);
            else if (category === 'prev_team') {
              [player.prev_team_1, player.prev_team_2, player.prev_team_3].forEach(t => t && keys.push(t));
            } else if (category === 'draft_year' && player.draft_year) keys.push(player.draft_year);
            else if (category === 'hometown') keys.push(player.hometown || '不明');

            keys.forEach(key => {
              if (!key || key === '-' || key === '未設定') return;
              const displayKey = category === 'draft_year' ? `${key}年指名` : key;
              if (!stats[key]) {
                stats[key] = { name: displayKey, total_hits: 0, total_hr: 0, total_rbi: 0, players: [] };
              }
              stats[key].total_hits += (Number(perf.h_hits) || 0);
              stats[key].total_hr += (Number(perf.h_hr) || 0);
              stats[key].total_rbi += (Number(perf.h_rbi) || 0);

              const pName = player.player_name || '不明';
              const pIdx = stats[key].players.findIndex(p => p.name === pName);
              if (pIdx === -1) {
                stats[key].players.push({ 
                  id: player.player_id, 
                  name: pName, 
                  hits: Number(perf.h_hits) || 0, 
                  hr: Number(perf.h_hr) || 0, 
                  team: player.team_name || '不明'
                });
              } else {
                stats[key].players[pIdx].hits += (Number(perf.h_hits) || 0);
                stats[key].players[pIdx].hr += (Number(perf.h_hr) || 0);
              }
            });
          });
        }
        setRanking(Object.values(stats).sort((a, b) => b.total_hits - a.total_hits));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [period, category]);

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-6 bg-white p-6 rounded-2xl shadow-xl border-t-8 border-blue-900">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-black text-blue-900 italic tracking-tighter">
            BASEBALL <span className="text-red-600">ROOTS</span>
          </h1>
          <div className="text-right">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{period} / {category}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{displayDate}</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {[{ id: 'high_school', n: '高校' }, { id: 'university', n: '大学' }, { id: 'prev_team', n: '前所属' }, { id: 'draft_year', n: 'ドラフト' }, { id: 'hometown', n: '出身地' }].map(c => (
            <Link key={c.id} href={`/?period=${period}&cat=${c.id}`} className={`px-4 py-2 rounded-lg text-[11px] font-black transition-all ${category === c.id ? 'bg-blue-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
              {c.n}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex bg-slate-100 p-1 rounded-xl">
          {(['today', 'yesterday', 'weekly', 'season'] as Period[]).map(p => (
            <Link key={p} href={`/?period=${p}&cat=${category}`} className={`flex-1 text-center py-2 rounded-lg text-[10px] font-black transition-all ${period === p ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              {p === 'today' ? '今日' : p === 'yesterday' ? '昨日' : p === 'weekly' ? '週間' : '通算'}
            </Link>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="text-center py-20 text-blue-900 font-black animate-pulse">データを集計中...</div>
      ) : (
        <div className="space-y-3">
          {ranking.map((item, index) => {
            const rawName = category === 'draft_year' ? item.name.replace('年指名', '') : item.name;
            const detailUrl = `/roots/${CATEGORY_URL_MAP[category]}/${encodeURIComponent(rawName)}`;

            return (
              <details key={item.name} className="group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:border-blue-300 transition-all">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <div className="flex items-center gap-5 flex-1">
                    <div className={`text-2xl font-black italic w-8 ${index < 3 ? 'text-blue-600' : 'text-slate-200'}`}>{index + 1}</div>
                    
                    <div className="group/name">
                      <h2 className="text-xl font-bold text-slate-800 underline decoration-blue-100 decoration-4 underline-offset-4">{item.name}</h2>
                    </div>
                  </div>
                  
                  <div className="flex gap-6 items-center">
                    <div className="text-right leading-none border-r pr-6 border-slate-100">
                      <p className="text-[10px] text-slate-400 font-black mb-1 uppercase">Hits</p>
                      <p className="text-2xl font-black text-blue-900">{item.total_hits}</p>
                    </div>
                    <div className="text-right leading-none pl-0">
                      <p className="text-[10px] text-slate-400 font-black mb-1 uppercase">HR</p>
                      <p className="text-2xl font-black text-red-600">{item.total_hr}</p>
                    </div>
                  </div>
                </summary>

                <div className="px-5 md:px-16 pb-6 pt-4 bg-slate-50 border-t border-slate-100">
                  {/* 【修正】タイトルとリンクを横並びに配置 */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">主な活躍選手</p>
                    <Link href={detailUrl} className="text-[10px] font-black text-blue-500 hover:text-blue-700 flex items-center gap-1 bg-blue-100/50 px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-sm">
                      詳細ランキングを見る
                      <span className="text-xs">→</span>
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.players.sort((a,b)=>b.hits - a.hits).map(p => (
                      <Link key={p.name} href={`/player/${p.id}`} className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm text-xs flex items-center gap-2 hover:border-blue-500 hover:bg-blue-50 transition-all group/item">
                        <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-500 font-bold">{p.team}</span>
                        <span className="font-bold text-slate-700 group-hover/item:text-blue-600 underline decoration-blue-200 decoration-2 underline-offset-4">{p.name}</span>
                        <span className="text-blue-600 font-black">{p.hits}H</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-900">
      <Suspense fallback={<div className="text-center py-20 text-blue-900 font-black">初期化中...</div>}>
        <RankingList />
      </Suspense>
      <footer className="mt-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">
        © 2026 BASEBALL ROOTS ANALYTICS
      </footer>
    </main>
  );
}