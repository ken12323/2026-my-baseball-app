'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// 型定義
type RankedPlayer = {
  player_id: string;
  player_name: string;
  team_name: string;
  position: string;
  war: number;
  main_stat: string; // 打率や防御率など
  is_pitcher: boolean;
};

const toF = (val: any) => parseFloat(val) || 0;

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const name = decodeURIComponent(params.name as string);

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  // カテゴリ名の日本語変換
  const typeLabel: Record<string, string> = {
    high_school: '高校別',
    university: '大学別',
    hometown: '出身地別',
    draft: 'ドラフト同期',
    previous_team: '前所属別'
  };

  useEffect(() => {
    async function fetchRanking() {
      setLoading(true);
      
      // 1. まず、そのルーツに所属する全選手を取得
      let query = supabase.from('players').select('*');
      
      if (type === 'high_school') query = query.eq('high_school', name);
      else if (type === 'university') query = query.eq('university', name);
      else if (type === 'hometown') query = query.eq('hometown', name);
      else if (type === 'draft') query = query.eq('draft_year', name);
      else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name}`);

      const { data: playerList } = await query;
      if (!playerList) { setLoading(false); return; }

      const playerIds = playerList.map(p => p.player_id);

      // 2. 2026年の成績を取得
      const [batting, pitching] = await Promise.all([
        supabase.from('batting_stats').select('*').in('player_id', playerIds).eq('年度', '2026'),
        supabase.from('pitching_stats').select('*').in('player_id', playerIds).eq('年度', '2026')
      ]);

      // 3. データを統合してランキング形式に整理
      const combined = playerList.map(p => {
        const b = batting.data?.find(s => s.player_id === p.player_id);
        const pi = pitching.data?.find(s => s.player_id === p.player_id);
        
        const isPitcher = p.position_detail === '投手';
        const war = isPitcher ? toF(pi?.投手WAR) : toF(b?.野手WAR);
        const mainStat = isPitcher 
          ? `防御率 ${toF(pi?.防御率).toFixed(2)}` 
          : `打率 .${toF(b?.打率).toFixed(3).split('.')[1]}`;

        return {
          player_id: p.player_id,
          player_name: p.player_name,
          team_name: p.team_name,
          position: p.position_detail,
          war,
          main_stat: mainStat,
          is_pitcher: isPitcher
        };
      });

      // WARが高い順にソート
      setPlayers(combined.sort((a, b) => b.war - a.war));
      setLoading(false);
    }
    fetchRanking();
  }, [type, name]);

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-blue-600">ランキング集計中...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-6 inline-block">← TOPへ戻る</Link>
        
        <header className="mb-10 text-center">
          <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
            {typeLabel[type] || 'ROOTS'} Ranking
          </span>
          <h1 className="text-4xl md:text-6xl font-black italic text-blue-900 mt-2 tracking-tighter">
            {name}
          </h1>
          <p className="text-slate-400 font-bold mt-2">2026 Season Best Players</p>
        </header>

        <div className="space-y-4">
          {players.length > 0 ? (
            players.map((p, index) => (
              <Link 
                href={`/player/${p.player_id}`} 
                key={p.player_id}
                className="block bg-white rounded-3xl p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-blue-200 group"
              >
                <div className="flex items-center gap-6">
                  {/* 順位 */}
                  <div className="w-12 text-center">
                    <span className={`text-3xl font-black italic ${index === 0 ? 'text-yellow-500' : 'text-slate-300'}`}>
                      {index + 1}
                    </span>
                  </div>

                  {/* 選手情報 */}
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-blue-500 uppercase">{p.team_name}</p>
                    <h2 className="text-xl md:text-2xl font-black text-slate-800 group-hover:text-blue-600 transition-colors">
                      {p.player_name}
                    </h2>
                    <p className="text-xs font-bold text-slate-400">{p.position} / {p.main_stat}</p>
                  </div>

                  {/* WARスコア */}
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-300 uppercase">Contribution</p>
                    <div className={`text-2xl font-black italic leading-none ${p.war > 0 ? 'text-orange-500' : 'text-slate-400'}`}>
                      {p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)}
                      <span className="text-[10px] ml-1 not-italic text-slate-400">WAR</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="bg-white rounded-3xl p-20 text-center text-slate-300 font-black">
              データが見つかりませんでした
            </div>
          )}
        </div>
      </div>

      <footer className="mt-20 text-center text-gray-300 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">
        © 2026 BASEBALL ROOTS ANALYTICS
      </footer>
    </main>
  );
}