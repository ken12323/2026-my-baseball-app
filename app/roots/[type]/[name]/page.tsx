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
  is_pitcher: boolean;
  // メイン成績用
  games: number;
  pa: number;
  hits: number;
  hr: number;
  avg: number;
  ops: number;
  war: number;
  // 投手用追加
  era: number;
  so: number;
  wins: number;
  ip: string;
};

const toF = (val: any) => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('avg'); 
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);
        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

        const { data: playerList } = await query;
        if (!playerList) return;

        const ids = playerList.map(p => String(p.player_id));
        const [bRes, pRes] = await Promise.all([
          supabase.from('batting_stats').select('*').in('player_id', ids).eq('年度', selectedYear),
          supabase.from('pitching_stats').select('*').in('player_id', ids).eq('年度', selectedYear)
        ]);

        const batting = bRes.data || [];
        const pitching = pRes.data || [];

        const combined = playerList.map(p => {
          const pid = String(p.player_id).trim();
          const isP = p.position_detail?.includes('投手');
          const bStat = batting.find(s => String(s.player_id).trim() === pid);
          const pStat = pitching.find(s => String(s.player_id).trim() === pid);

          // 日本語カラム名を安全に取得
          const bWar = bStat ? toF(bStat['野手WAR']) : 0;
          const pWar = pStat ? toF(pStat['投手WAR']) : 0;
          const bSo = bStat ? toF(bStat['三振']) : 0;
          const pSo = pStat ? toF(pStat['三振']) : 0;

          return {
            player_id: p.player_id,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            games: toF(bStat?.試合 || pStat?.登板),
            pa: toF(bStat?.打席),
            hits: toF(bStat?.安打),
            hr: toF(bStat?.本塁打),
            avg: toF(bStat?.打率),
            ops: toF(bStat?.OPS),
            war: isP ? pWar : bWar,
            era: isP ? (toF(pStat?.防御率) || 99.99) : 99.99,
            so: isP ? pSo : bSo,
            wins: isP ? toF(pStat?.勝利) : 0,
            ip: String(pStat?.投球回 || '0')
          };
        });
        setPlayers(combined);
      } finally { setLoading(false); }
    }
    fetchRanking();
  }, [type, name, selectedYear]);

  const filteredPlayers = players.filter(p => {
    const isPitchKey = ['era', 'wins', 'so'].includes(sortKey);
    const isBatKey = ['hits', 'hr', 'avg', 'ops'].includes(sortKey);
    if (isPitchKey) return p.is_pitcher && p.ip !== '0' && p.ip !== '0.0';
    if (isBatKey) return p.pa > 0;
    return (p.pa > 0 || p.ip !== '0');
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era;
    // 打率などの場合、同値なら打席数やWARでさらにソートして幽霊順位を防ぐ
    if ((b as any)[sortKey] === (a as any)[sortKey]) return b.war - a.war;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-flex items-center gap-1">← TOP</Link>
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic mb-6">{name} <span className="text-blue-600">Stats</span></h1>
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-slate-200 p-1 rounded-2xl">
              {[2026, 2025, 2024].map(year => (
                <button key={year} onClick={() => setSelectedYear(year)} className={`px-6 py-2 rounded-xl text-[11px] font-black transition-all ${selectedYear === year ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{year} {year === 2026 ? '通算' : '確定'}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-6 border-t">
            {['hits', 'hr', 'avg', 'ops', 'war', 'era', 'so', 'wins'].map(k => (
              <button key={k} onClick={() => setSortKey(k)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === k ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border hover:bg-slate-50'}`}>{k.toUpperCase()}</button>
            ))}
          </div>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic tracking-tighter uppercase">Fetching...</div>
          ) : sortedPlayers.length > 0 ? (
            sortedPlayers.map((p, index) => (
              <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl border group transition-all">
                <div className="flex items-center gap-4 md:gap-6">
                  <div className={`text-4xl md:text-5xl font-black italic w-12 text-center ${index === 0 ? 'text-yellow-400' : 'text-slate-100'}`}>{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-blue-500 uppercase leading-none mb-1">{p.team_name}</p>
                    <div className="flex items-baseline gap-2 mb-1">
                      <h2 className="text-2xl md:text-3xl font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-none">{p.player_name}</h2>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{p.position}</span>
                    </div>
                    {/* ★主な成績を表示するバー */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                      <span className="bg-slate-100 px-2 py-0.5 rounded">{p.games}試合</span>
                      <span>{p.pa}打席</span>
                      <span>{p.hits}安打</span>
                      <span>{p.hr}HR</span>
                      <span className="text-slate-900">打率 .{String(p.avg.toFixed(3)).split('.')[1]}</span>
                      <span className="text-slate-900">OPS {p.ops.toFixed(3)}</span>
                      <span className="text-blue-600 font-extrabold italic bg-blue-50 px-2 py-0.5 rounded">WAR {p.war.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="text-right border-l pl-4 md:pl-6 min-w-[100px] md:min-w-[120px]">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{sortKey}</p>
                    <div className="text-3xl md:text-4xl font-black italic text-slate-900 leading-none">
                      {sortKey === 'hits' && p.hits}
                      {sortKey === 'hr' && p.hr}
                      {sortKey === 'avg' && `.${String(p.avg.toFixed(3)).split('.')[1]}`}
                      {sortKey === 'ops' && p.ops.toFixed(3)}
                      {sortKey === 'war' && (p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1))}
                      {sortKey === 'era' && (p.era > 90 ? '-.--' : p.era.toFixed(2))}
                      {sortKey === 'so' && p.so}
                      {sortKey === 'wins' && p.wins}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : <div className="p-20 text-center text-slate-300 font-black italic uppercase">No Stats Recorded</div>}
        </div>
      </div>
    </main>
  );
}