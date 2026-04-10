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
  const name = rawName.replace('年指名', '').replace('年', ''); // クリーニング強化

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('war'); 

  const typeLabel: Record<string, string> = {
    high_school: '高校別',
    university: '大学別',
    hometown: '出身地別',
    draft: 'ドラフト同期',
    previous_team: '前所属別'
  };

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);
        
        // 1. 選手基本情報の取得
        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team' || type === 'previous_team') {
          query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);
        }

        const { data: playerList, error: pErr } = await query;
        if (pErr || !playerList || playerList.length === 0) {
          setPlayers([]);
          setLoading(false);
          return;
        }

        const playerIds = playerList.map(p => p.player_id);

        // 2. 2026年成績の取得
        const [batting, pitching] = await Promise.all([
          supabase.from('batting_stats').select('*').in('player_id', playerIds).eq('年度', '2026'),
          supabase.from('pitching_stats').select('*').in('player_id', playerIds).eq('年度', '2026')
        ]);

        // 3. マッチング（IDをNumber化して確実に紐付ける）
        const combined = playerList.map(p => {
          const pid = Number(p.player_id);
          const b = batting.data?.find(s => Number(s.player_id) === pid);
          const pi = pitching.data?.find(s => Number(s.player_id) === pid);
          
          const isP = p.position_detail === '投手';

          return {
            player_id: p.player_id,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            // 野手指標（データベースのカラム名を正確に指定）
            war: isP ? toF(pi?.投手WAR) : toF(b?.野手WAR),
            hits: toF(b?.安打),
            hr: toF(b?.本塁打),
            avg: toF(b?.打率),
            ops: toF(b?.OPS),
            // 投手指標
            era: isP ? (pi?.防御率 === '-' || !pi?.防御率 ? 99.99 : toF(pi?.防御率)) : 99.99,
            so: toF(pi?.三振),
            wins: toF(pi?.勝利)
          };
        });

        setPlayers(combined);
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [type, name]);

  // 並べ替え処理
  const sortedPlayers = [...players].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era; // 防御率は低い方が上
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  const SortButton = ({ k, label }: { k: string, label: string }) => (
    <button 
      onClick={() => setSortKey(k)}
      className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${sortKey === k ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-blue-600">ランキング集計中...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900 font-sans">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-block hover:opacity-70 transition-opacity">← TOPへ戻る</Link>
        
        <header className="mb-12 text-center">
          <div className="inline-block bg-blue-600 text-white px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
            {typeLabel[type] || 'ROOTS'} Ranking
          </div>
          <h1 className="text-5xl md:text-7xl font-black italic text-slate-900 mt-4 tracking-tighter leading-none">
            {name}{type === 'draft' && '年ドラフト'}
          </h1>
          
          <div className="mt-10">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">ランキング基準を選択</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
              <SortButton k="war" label="貢献度(WAR)" />
              <div className="w-full md:w-auto h-[1px] md:w-[1px] md:h-4 bg-slate-200 self-center mx-1" />
              <SortButton k="hits" label="安打" />
              <SortButton k="hr" label="本塁打" />
              <SortButton k="avg" label="打率" />
              <SortButton k="ops" label="OPS" />
              <div className="w-full md:w-auto h-[1px] md:w-[1px] md:h-4 bg-slate-200 self-center mx-1" />
              <SortButton k="era" label="防御率" />
              <SortButton k="so" label="三振" />
              <SortButton k="wins" label="勝利" />
            </div>
          </div>
        </header>

        <div className="space-y-4">
          {sortedPlayers.length > 0 ? (
            sortedPlayers.map((p, index) => (
              <Link 
                href={`/player/${p.player_id}`} 
                key={p.player_id}
                className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border border-slate-100 group"
              >
                <div className="flex items-center gap-6">
                  {/* 順位表示 */}
                  <div className="w-12 text-center">
                    <span className={`text-4xl font-black italic ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-100'}`}>
                      {index + 1}
                    </span>
                  </div>

                  {/* 選手メイン情報 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-blue-500 uppercase truncate">{p.team_name}</p>
                    <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {p.player_name}
                    </h2>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-bold text-slate-400">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500">{p.position}</span>
                      <span className={sortKey === 'avg' ? 'text-blue-600 font-black' : ''}>打率 .{(p.avg).toFixed(3).split('.')[1]}</span>
                      <span className={sortKey === 'hr' ? 'text-red-600 font-black' : ''}>{p.hr} HR</span>
                      {p.is_pitcher && <span className={sortKey === 'era' ? 'text-blue-600 font-black' : ''}>防御率 {p.era.toFixed(2)}</span>}
                    </div>
                  </div>

                  {/* 数値強調表示 */}
                  <div className="text-right min-w-[100px] border-l border-slate-50 pl-6">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">
                      {sortKey === 'war' ? 'Season WAR' : sortKey.toUpperCase()}
                    </p>
                    <div className={`text-3xl font-black italic leading-none ${p.war > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                      {sortKey === 'war' && (p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1))}
                      {sortKey === 'hits' && p.hits}
                      {sortKey === 'hr' && p.hr}
                      {sortKey === 'avg' && `.${(p.avg).toFixed(3).split('.')[1]}`}
                      {sortKey === 'ops' && (p.ops).toFixed(3)}
                      {sortKey === 'era' && (p.era > 90 ? '-.--' : p.era.toFixed(2))}
                      {sortKey === 'so' && p.so}
                      {sortKey === 'wins' && p.wins}
                      
                      <span className="text-[10px] ml-1 not-italic text-slate-300">
                        {sortKey === 'war' ? 'WAR' : sortKey === 'hits' ? 'H' : sortKey === 'hr' ? 'HR' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="bg-white rounded-[2rem] p-20 text-center">
              <p className="text-slate-300 font-black text-xl italic uppercase tracking-widest">No Active Players Found</p>
              <p className="text-slate-400 text-sm mt-2 font-bold">2026年シーズンの出場データがありません</p>
            </div>
          )}
        </div>
      </div>
      <footer className="mt-24 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">
        © 2026 BASEBALL ROOTS ANALYTICS
      </footer>
    </main>
  );
}