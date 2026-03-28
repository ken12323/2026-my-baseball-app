'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// スクレイピングした日付に合わせる
const TARGET_DATE = '2026-03-27';

export default function DailyRanking() {
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  useEffect(() => {
    async function getRanking() {
      try {
        setLoading(true);
        
        // 【修正完了】team を team_name に書き換えました
        const { data, error } = await supabase
          .from('daily_performance')
          .select(`
            h_hits, 
            h_hr, 
            h_rbi, 
            player_name,
            players ( 
              high_school, 
              team_name 
            )
          `)
          .eq('date', TARGET_DATE);

        if (error) {
          console.error('データ取得に失敗しました:', error.message);
          setRankings([]);
          return;
        }

        if (data) {
          const agg: Record<string, any> = {};

          data.forEach((row: any) => {
            const school = row.players?.high_school || '未設定';
            if (school === '未設定') return;

            if (!agg[school]) {
              agg[school] = { school, hits: 0, hr: 0, players: [] };
            }

            agg[school].hits += row.h_hits;
            agg[school].hr += row.h_hr;

            if (row.h_hits > 0 || row.h_hr > 0) {
              agg[school].players.push({
                name: row.player_name,
                team: row.players?.team_name || '不明', // ここも修正
                hits: row.h_hits,
                hr: row.h_hr
              });
            }
          });

          const sorted = Object.values(agg).sort((a: any, b: any) => b.hits - a.hits);
          setRankings(sorted);
        }
      } catch (err) {
        console.error('予期せぬエラー:', err);
      } finally {
        setLoading(false);
      }
    }

    getRanking();
  }, []);

  if (loading) {
    return (
      <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic">
        LOADING DATA...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-10 font-sans tracking-tight">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10 text-center">
          <Link href="/" className="text-blue-600 font-black mb-6 inline-block hover:scale-110 transition-transform italic text-xl underline decoration-4 underline-offset-8">
            ← BACK TO MENU
          </Link>
          <div className="bg-gradient-to-br from-blue-600 to-blue-900 p-8 rounded-[3rem] shadow-2xl text-white border-b-[12px] border-blue-950">
            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter drop-shadow-md text-white">
              母校別・昨日の活躍
            </h1>
            <p className="font-bold opacity-90 mt-3 tracking-widest text-sm bg-blue-500/30 py-1 px-4 rounded-full inline-block text-white">
              {TARGET_DATE} RESULTS
            </p>
          </div>
        </header>

        <div className="space-y-6">
          {rankings.length > 0 ? (
            rankings.map((item, i) => (
              <div key={i} className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border-4 border-white transition-all hover:shadow-2xl">
                <div 
                  className="p-6 flex justify-between items-center cursor-pointer hover:bg-blue-50 active:scale-[0.98] transition-all"
                  onClick={() => setOpenDetail(openDetail === item.school ? null : item.school)}
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-3xl shadow-lg transform -rotate-3
                      ${i === 0 ? 'bg-yellow-400 border-b-4 border-yellow-600' : 
                        i === 1 ? 'bg-slate-300 border-b-4 border-slate-500' : 
                        i === 2 ? 'bg-amber-600 border-b-4 border-amber-800' : 'bg-blue-900 text-white'}`}>
                      {i + 1}
                    </div>
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-blue-950 leading-none mb-1">{item.school}</h2>
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest italic">Click for details</p>
                    </div>
                  </div>
                  <div className="flex gap-6 text-center pr-2">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Hits</p>
                      <p className="text-4xl font-black text-blue-600 leading-none">{item.hits}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-red-400 uppercase mb-1">HR</p>
                      <p className="text-4xl font-black text-red-600 leading-none">{item.hr}</p>
                    </div>
                  </div>
                </div>

                {openDetail === item.school && (
                  <div className="bg-blue-50/50 p-6 border-t-4 border-dotted border-blue-100">
                    <div className="grid grid-cols-1 gap-3">
                      {item.players.map((p: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-blue-50">
                          <div className="flex flex-col">
                            <span className="font-black text-blue-900 text-lg">{p.name}</span>
                            <span className="text-[11px] font-bold text-white bg-blue-500 px-3 py-0.5 rounded-full inline-block w-fit mt-1 shadow-sm">
                              {p.team}
                            </span>
                          </div>
                          <div className="flex gap-5 font-black text-gray-600">
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] text-gray-400 uppercase">Hits</span>
                              <span className="text-xl text-blue-600">{p.hits}</span>
                            </div>
                            {p.hr > 0 && (
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-red-400 uppercase">HR</span>
                                <span className="text-xl text-red-600">{p.hr}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-[3rem] p-20 text-center border-4 border-dashed border-gray-200">
              <p className="text-gray-400 font-black italic text-xl">
                データが見つかりません。
              </p>
            </div>
          )}
        </div>
        
        <footer className="mt-20 text-center text-gray-300 text-[10px] font-black uppercase tracking-[0.5em] italic pb-10">
          © 2026 NPB ALUMNI ANALYTICS
        </footer>
      </div>
    </main>
  );
}