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

const toF = (val: any) => parseFloat(val) || 0;
const normId = (id: any) => String(id || '').trim().replace(/^0+/, '');

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('hits'); 
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);

        // 1. 選手情報の取得
        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

        const { data: playerList } = await query;
        if (!playerList || playerList.length === 0) {
          setPlayers([]); setLoading(false); return;
        }
        const ids = playerList.map(p => normId(p.player_id));

        // 2. データの取得 (2026年を含め、すべて stats テーブルから取得)
        // SQLで確認した通り、'年度' は bigint なので数値で検索します
        const { data: batting } = await supabase.from('batting_stats').select('*').in('player_id', ids).eq('年度', selectedYear);
        const { data: pitching } = await supabase.from('pitching_stats').select('*').in('player_id', ids).eq('年度', selectedYear);

        // 3. マッチング処理
        const combined = playerList.map(p => {
          const pid = normId(p.player_id);
          const isP = p.position_detail === '投手';
          const bStat = (batting || []).find(s => normId(s.player_id) === pid);
          const pStat = (pitching || []).find(s => normId(s.player_id) === pid);

          // すべて集計表（stats）の数値をそのまま使用
          return {
            player_id: p.player_id,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            hits: toF(bStat?.安打),
            hr: toF(bStat?.本塁打),
            avg: toF(bStat?.打率),
            ops: toF(bStat?.OPS),
            war: isP ? toF(pStat?.投手WAR) : toF(bStat?.野手WAR),
            era: isP ? (toF(pStat?.防御率) || 99.99) : 99.99,
            so: toF(pStat?.三振),
            wins: toF(pStat?.勝利)
          };
        });

        setPlayers(combined);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [type, name, selectedYear]);

  // 並び替えロジック
  const sortedPlayers = [...players].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-flex items-center gap-1 hover:opacity-70">
          <span>←</span> TOP
        </Link>
        
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic text-slate-900 tracking-tighter leading-none mb-6">
            {name} <span className="text-blue-600">Stats</span>
          </h1>

          {/* 年度切り替えタブ */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-slate-200 p-1 rounded-2xl">
              {[2026, 2025, 2024].map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-6 py-2 rounded-xl text-[11px] font-black transition-all ${selectedYear === year ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {year} {year === 2026 ? '通算' : '確定'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-2 pt-6 border-t border-slate-100">
            {['hits', 'hr', 'war', 'avg', 'ops', 'era', 'so', 'wins'].map(k => (
              <button 
                key={k}
                onClick={() => setSortKey(k)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === k ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic tracking-tighter">FETCHING {selectedYear} DATA...</div>
          ) : sortedPlayers.length > 0 ? (
            sortedPlayers.map((p, index) => (
              <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all border border-slate-100 group">
                <div className="flex items-center gap-6">
                  <div className={`text-4xl font-black italic w-12 text-center ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-100'}`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-blue-500 uppercase truncate">{p.team_name}</p>
                    <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors truncate">{p.player_name}</h2>
                    <p className="text-[11px] font-bold text-slate-400">{p.position}</p>
                  </div>
                  <div className="text-right border-l border-slate-50 pl-6 min-w-[110px]">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{sortKey}</p>
                    <div className="text-3xl font-black italic leading-none text-slate-900">
                      {sortKey === 'hits' && p.hits}
                      {sortKey === 'hr' && p.hr}
                      {sortKey === 'war' && (p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1))}
                      {sortKey === 'avg' && `.${String(p.avg.toFixed(3)).split('.')[1]}`}
                      {sortKey === 'ops' && p.ops.toFixed(3)}
                      {sortKey === 'era' && (p.era > 90 ? '-.--' : p.era.toFixed(2))}
                      {sortKey === 'so' && p.so}
                      {sortKey === 'wins' && p.wins}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="bg-white rounded-[2rem] p-20 text-center text-slate-300 font-black italic uppercase tracking-widest">
              No Stats Recorded in {selectedYear}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}