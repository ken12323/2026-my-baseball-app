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
  is_qualified: boolean; 
  games: number; pa: number; hits: number; hr: number; avg: number; ops: number; war: number;
  era: number; so: number; wins: number; ip: string;
};

const toF = (val: any) => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

const findValue = (obj: any, keys: string[]) => {
  if (!obj) return 0;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return toF(obj[key]);
  }
  return 0;
};

const SORT_OPTIONS: Record<string, string> = {
  hits: '安打', hr: '本塁打', avg: '打率', ops: 'OPS', war: 'WAR', era: '防御率', so: '三振', wins: '勝利'
};

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('war'); 
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);

        const { data: maxGamesData } = await supabase.from('batting_stats').select('*').eq('年度', selectedYear);
        const teamGames: Record<string, number> = {};
        let globalMaxGames = 0; // 保険：全体の最多試合数
        
        maxGamesData?.forEach(r => {
          const row = r as any; 
          const t = row.所属球団 || '';
          const g = parseInt(row.試合) || 0;
          if (g > globalMaxGames) globalMaxGames = g;
          if (!teamGames[t] || g > teamGames[t]) {
            teamGames[t] = g;
          }
        });

        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

        const { data: playerList } = await query;
        if (!playerList || playerList.length === 0) return;

        const searchIds = playerList.flatMap(p => {
          const s = String(p.player_id).trim();
          return [s, s.padStart(8, '0'), s.replace(/^0+/, '')];
        });
        const uniqueSearchIds = Array.from(new Set(searchIds));

        const [bRes, pRes] = await Promise.all([
          supabase.from('batting_stats').select('*').in('player_id', uniqueSearchIds).eq('年度', selectedYear),
          supabase.from('pitching_stats').select('*').in('player_id', uniqueSearchIds).eq('年度', selectedYear)
        ]);

        const batting = bRes.data || [];
        const pitching = pRes.data || [];

        const combined = playerList.map(p => {
          const safeMasterId = String(p.player_id).trim().padStart(8, '0');
          const isP = p.position_detail?.includes('投手');
          
          const bStat = batting.find(s => String(s.player_id).trim().padStart(8, '0') === safeMasterId);
          const pStat = pitching.find(s => String(s.player_id).trim().padStart(8, '0') === safeMasterId);

          // ★修正：球団名（「阪神タイガース」と「阪　神」等）の表記揺れを吸収して試合数を取得
          let teamGameCount = globalMaxGames;
          const pTeamClean = (p.team_name || '').replace(/\s+/g, '');
          for (const [shortName, games] of Object.entries(teamGames)) {
            if (pTeamClean.includes(shortName.replace(/\s+/g, ''))) {
              teamGameCount = games;
              break;
            }
          }

          const requiredPA = Math.floor(teamGameCount * 3.1);
          const requiredIP = teamGameCount;

          const isQualified = isP 
            ? toF(pStat?.投球回) >= requiredIP 
            : toF(bStat?.打席) >= requiredPA;

          return {
            player_id: safeMasterId,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            is_qualified: isQualified, 
            games: toF(bStat?.試合 || pStat?.登板),
            pa: toF(bStat?.打席),
            hits: toF(bStat?.安打),
            hr: toF(bStat?.本塁打),
            avg: toF(bStat?.打率),
            ops: toF(bStat?.OPS),
            war: isP ? findValue(pStat, ['投手WAR', 'war', 'WAR']) : findValue(bStat, ['野手WAR', 'war', 'WAR']),
            so: isP ? findValue(pStat, ['三振', '奪三振']) : findValue(bStat, ['三振']),
            era: isP ? (toF(pStat?.防御率) || 99.99) : 99.99,
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
    const hasAnyRecord = p.games > 0 || p.pa > 0 || (p.ip !== '0' && p.ip !== '');
    const isPitchKey = ['era', 'wins', 'so'].includes(sortKey);
    const isBatKey = ['hits', 'hr', 'avg', 'ops'].includes(sortKey);
    
    if (isPitchKey) return p.is_pitcher && hasAnyRecord;
    if (isBatKey) return !p.is_pitcher && hasAnyRecord; 
    return hasAnyRecord;
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era; 
    if ((b as any)[sortKey] === (a as any)[sortKey]) return b.war - a.war || b.pa - a.pa;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  // ★追加：規定到達が関係する指標の判定（ご要望通り、率系＋WAR）
  const requiresQualification = ['avg', 'ops', 'war', 'era'].includes(sortKey);

  const qualifiedPlayers = sortedPlayers.filter(p => p.is_qualified);
  const unqualifiedPlayers = sortedPlayers.filter(p => !p.is_qualified);

  // カード描画コンポーネント
  const renderPlayerCard = (p: RankedPlayer, index: number, applyQualStyle: boolean) => {
    const isDimmed = applyQualStyle && !p.is_qualified;
    return (
      <Link href={`/player/${p.player_id}`} key={p.player_id} className={`block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl border group transition-all ${isDimmed ? 'opacity-80 hover:opacity-100 bg-slate-50/50' : ''}`}>
        <div className="flex items-center gap-4 md:gap-8">
          <div className={`text-4xl md:text-5xl font-black italic w-12 text-center ${index === 0 && (!applyQualStyle || p.is_qualified) ? 'text-yellow-400' : 'text-slate-200'}`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-blue-500 uppercase mb-1">{p.team_name}</p>
            <div className="flex items-baseline gap-2 mb-3 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-none">{p.player_name}</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase">{p.position}</span>
              {isDimmed && (
                <span className="text-[9px] font-black bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100 leading-none">
                  規定未満
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-black text-slate-400 uppercase tracking-tighter border-t pt-2">
              <div className="flex gap-2">
                {p.is_pitcher ? (
                  <><span>{p.games}登板</span> <span>{p.ip}回</span></>
                ) : (
                  <><span>{p.games}試合</span> <span>{p.pa}打席</span> <span>{p.hits}安打</span> <span>{p.hr}HR</span></>
                )}
              </div>
              <div className="flex gap-2 border-l pl-3">
                {p.is_pitcher ? (
                  <>
                    <span className="text-slate-900 font-bold">防 {p.era > 90 ? '-.--' : p.era.toFixed(2)}</span>
                    <span className="text-slate-900 font-bold">{p.so}奪三振</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-900 font-bold">打率 .{String(p.avg.toFixed(3)).split('.')[1]}</span>
                    <span className="text-slate-900 font-bold">OPS {p.ops.toFixed(3)}</span>
                  </>
                )}
                <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded italic font-black">WAR {p.war >= 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <div className="text-right border-l pl-6 min-w-[110px]">
            <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{SORT_OPTIONS[sortKey]}</p>
            <div className="text-3xl md:text-4xl font-black italic text-slate-900 leading-none">
              {sortKey === 'hits' && p.hits}
              {sortKey === 'hr' && p.hr}
              {sortKey === 'avg' && `.${String(p.avg.toFixed(3)).split('.')[1]}`}
              {sortKey === 'ops' && p.ops.toFixed(3)}
              {sortKey === 'war' && (p.war >= 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1))}
              {sortKey === 'era' && (p.era > 90 ? '-.--' : p.era.toFixed(2))}
              {sortKey === 'so' && Math.round(p.so)}
              {sortKey === 'wins' && p.wins}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900 font-sans tracking-tight">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-flex items-center gap-1 text-sm">← TOP</Link>
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
            {Object.entries(SORT_OPTIONS).map(([key, label]) => (
              <button key={key} onClick={() => setSortKey(key)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === key ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic tracking-tighter uppercase">Fetching...</div>
          ) : sortedPlayers.length > 0 ? (
            requiresQualification ? (
              <>
                {/* 率系指標：規定到達プレイヤー */}
                {qualifiedPlayers.map((p, index) => renderPlayerCard(p, index, true))}

                {/* 率系指標：規定未到達プレイヤー（参考記録） */}
                {unqualifiedPlayers.length > 0 && (
                  <>
                    <div className="pt-10 pb-4 flex items-center gap-4">
                      <div className="h-[2px] bg-slate-200 flex-1"></div>
                      <h3 className="text-slate-400 font-black text-sm tracking-widest uppercase flex items-center gap-2">
                        <span className="bg-slate-200 text-slate-500 px-2 py-1 rounded text-[10px]">参考記録</span>
                        {['era'].includes(sortKey) ? '規定投球回 未満' : '規定打席 未満'}
                      </h3>
                      <div className="h-[2px] bg-slate-200 flex-1"></div>
                    </div>
                    {unqualifiedPlayers.map((p, index) => renderPlayerCard(p, qualifiedPlayers.length + index, true))}
                  </>
                )}
              </>
            ) : (
              /* 積み上げ系指標（安打・本塁打など）：規定関係なく全員表示 */
              sortedPlayers.map((p, index) => renderPlayerCard(p, index, false))
            )
          ) : (
            <div className="p-20 text-center text-slate-300 font-black italic uppercase">
              No Stats Recorded for {selectedYear}<br/>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}