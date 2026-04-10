'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type RankedPlayer = {
  player_id: string;
  player_name: string;
  team_name: string;
  position: string;
  war: number;
  hits: number;
  hr: number;
  avg: number;
  ops: number;
  era: number;
  so: number;
  wins: number;
  is_pitcher: boolean;
};

const toF = (val: any) => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  const name = rawName.replace('年指名', ''); // ドラフト用のクリーニング

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('war'); // デフォルトはWAR順

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
      
      // 1. そのルーツの全選手を取得
      let query = supabase.from('players').select('*');
      if (type === 'high_school') query = query.eq('high_school', name);
      else if (type === 'university') query = query.eq('university', name);
      else if (type === 'hometown') query = query.eq('hometown', name);
      else if (type === 'draft') query = query.eq('draft_year', name);
      else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

      const { data: playerList } = await query;
      if (!playerList) { setLoading(false); return; }

      const playerIds = playerList.map(p => p.player_id);

      // 2. 2026年の成績をバッチ取得
      const [batting, pitching] = await Promise.all([
        supabase.from('batting_stats').select('*').in('player_id', playerIds).eq('年度', '2026'),
        supabase.from('pitching_stats').select('*').in('player_id', playerIds).eq('年度', '2026')
      ]);

      // 3. データをマッピング
      const combined = playerList.map(p => {
        const b = batting.data?.find(s => String(s.player_id) === String(p.player_id));
        const pi = pitching.data?.find(s => String(s.player_id) === String(p.player_id));
        const isP = p.position_detail === '投手';

        return {
          player_id: p.player_id,
          player_name: p.player_name,
          team_name: p.team_name,
          position: p.position_detail,
          is_pitcher: isP,
          // 野手指標
          war: isP ? toF(pi?.投手WAR) : toF(b?.野手WAR),
          hits: toF(b?.安打),
          hr: toF(b?.本塁打),
          avg: toF(b?.打率),
          ops: toF(b?.OPS),
          // 投手指標
          era: toF(pi?.防御率),
          so: toF(pi?.三振),
          wins: toF(pi?.勝利)
        };
      });

      setPlayers(combined);
      setLoading(false);
    }
    fetchRanking();
  }, [type, name]);

  // 並べ替えロジック
  const sortedPlayers = [...players].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era; // 防御率は低い順
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  const SortButton = ({ k, label }: { k: string, label: string }) => (
    <button 
      onClick={() => setSortKey(k)}
      className={`px-3 py-1.5 rounded-full text-[10px] font-black transition-all ${sortKey === k ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-blue-600">ランキング集計中...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-6 inline-block hover:underline">← TOPへ戻る</Link>
        
        <header className="mb-10 text-center">
          <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
            {typeLabel[type] || 'ROOTS'} Ranking
          </span>
          <h1 className="text-4xl md:text-6xl font-black italic text-blue-900 mt-2 tracking-tighter">
            {name}{type === 'draft' && '年ドラフト'}
          </h1>
          
          {/* ソートボタン群 */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Sort by Metric</p>
            <div className="flex flex-wrap justify-center gap-2">
              <SortButton k="war" label="貢献度(WAR)" />
              <div className="w-[1px] h-4 bg-slate-200 self-center mx-1" />
              <SortButton k="hits" label="安打" />
              <SortButton k="hr" label="本塁打" />
              <SortButton k="avg" label="打率" />
              <SortButton k="ops" label="OPS" />
              <div className="w-[1px] h-4 bg-slate-200 self-center mx-1" />
              <SortButton k="era" label="防御率" />
              <SortButton k="so" label="三振" />
              <SortButton k="wins" label="勝利" />
            </div>
          </div>
        </header>

        <div className="space-y-3">
          {sortedPlayers.length > 0 ? (
            sortedPlayers.map((p, index) => (
              <Link 
                href={`/player/${p.player_id}`} 
                key={p.player_id}
                className="block bg-white rounded-3xl p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border-2 border-transparent hover:border-blue-200 group"
              >
                <div className="flex items-center gap-6">
                  {/* 順位 */}
                  <div className="w-10 text-center">
                    <span className={`text-3xl font-black italic ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : 'text-slate-200'}`}>
                      {index + 1}
                    </span>
                  </div>

                  {/* 選手情報 */}
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-blue-500 uppercase">{p.team_name}</p>
                    <h2 className="text-xl font-black text-slate-800 group-hover:text-blue-600 transition-colors">
                      {p.player_name}
                    </h2>
                    <div className="flex gap-3 mt-1 text-[10px] font-bold text-slate-400">
                      <span>{p.position}</span>
                      <span className={sortKey === 'avg' ? 'text-blue-600' : ''}>打率 .{(p.avg).toFixed(3).split('.')[1]}</span>
                      <span className={sortKey === 'hits' ? 'text-blue-600' : ''}>{p.hits}安打</span>
                      <span className={sortKey === 'hr' ? 'text-red-600' : ''}>{p.hr}HR</span>
                    </div>
                  </div>

                  {/* スコア表示（ソートキーに合わせて表示を切り替え） */}
                  <div className="text-right min-w-[80px]">
                    <p className="text-[9px] font-black text-slate-300 uppercase leading-none mb-1">
                      {sortKey === 'war' ? 'Contribution' : sortKey.toUpperCase()}
                    </p>
                    <div className={`text-2xl font-black italic leading-none ${p.war >= 0 ? 'text-blue-900' : 'text-slate-400'}`}>
                      {sortKey === 'war' && (p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1))}
                      {sortKey === 'hits' && `${p.hits}`}
                      {sortKey === 'hr' && `${p.hr}`}
                      {sortKey === 'avg' && `.${(p.avg).toFixed(3).split('.')[1]}`}
                      {sortKey === 'ops' && (p.ops).toFixed(3)}
                      {sortKey === 'era' && (p.era).toFixed(2)}
                      {sortKey === 'so' && `${p.so}`}
                      {sortKey === 'wins' && `${p.wins}`}
                      
                      <span className="text-[10px] ml-1 not-italic text-slate-300">
                        {sortKey === 'war' ? 'WAR' : sortKey === 'hits' ? 'H' : sortKey === 'hr' ? 'HR' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="bg-white rounded-3xl p-20 text-center text-slate-300 font-black">
              2026年のデータが見つかりませんでした
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