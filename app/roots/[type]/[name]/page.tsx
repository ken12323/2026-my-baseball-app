'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// 表示用の型定義
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
  pa: number; 
  ip: string;
};

// 数値変換用ヘルパー
const toF = (val: any) => parseFloat(val) || 0;

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  // URLパラメータから「年」などを除外して検索キーを正規化
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('hits'); 
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);
        
        // 1. カテゴリに応じて選手マスターを検索
        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

        const { data: playerList } = await query;
        if (!playerList || playerList.length === 0) {
          setPlayers([]);
          return;
        }

        // 2. 該当選手のIDリストを取得（8桁の文字列を維持）
        const ids = playerList.map(p => String(p.player_id));

        // 3. 成績テーブルからデータを取得
        const [battingRes, pitchingRes] = await Promise.all([
          supabase.from('batting_stats').select('*').in('player_id', ids).eq('年度', selectedYear),
          supabase.from('pitching_stats').select('*').in('player_id', ids).eq('年度', selectedYear)
        ]);

        const batting = battingRes.data || [];
        const pitching = pitchingRes.data || [];

        // 4. 選手マスターと成績をマージ
        const combined = playerList.map(p => {
          const pid = String(p.player_id).trim(); // 比較用にトリム
          const isP = p.position_detail?.includes('投手');
          
          // ID完全一致で成績を特定（型エラー回避のため String 変換して比較）
          const bStat = batting.find(s => String(s.player_id).trim() === pid);
          const pStat = pitching.find(s => String(s.player_id).trim() === pid);

          return {
            player_id: p.player_id, 
            player_name: p.player_name, 
            team_name: p.team_name, 
            position: p.position_detail, 
            is_pitcher: isP,
            // 野手スタッツ
            hits: toF(bStat?.安打), 
            hr: toF(bStat?.本塁打), 
            avg: toF(bStat?.打率), 
            ops: toF(bStat?.OPS),
            pa: toF(bStat?.打席),
            // 投手スタッツ
            ip: String(pStat?.投球回 || '0'),
            wins: isP ? toF(pStat?.勝利) : 0,
            era: isP ? (toF(pStat?.防御率) || 99.99) : 99.99,
            // ★修正ポイント：DBから「三振」と「WAR」を確実に取得
            so: isP ? toF(pStat?.三振) : toF(bStat?.三振), 
            war: isP ? toF(pStat?.投手WAR) : toF(bStat?.野手WAR)
          };
        });

        setPlayers(combined);
      } catch (error) {
        console.error('Error fetching ranking:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [type, name, selectedYear]);

  // ★幽霊選手の排除ロジックを維持
  const filteredPlayers = players.filter(p => {
    const isPitchKey = ['era', 'wins', 'so'].includes(sortKey);
    const isBatKey = ['hits', 'hr', 'avg', 'ops'].includes(sortKey);
    
    // 投手指標なら「投球回がある投手」のみ
    if (isPitchKey) return p.is_pitcher && p.ip !== '0' && p.ip !== '0.0' && p.ip !== '';
    // 野手指標なら「打席がある野手（または投手）」のみ
    if (isBatKey) return p.pa > 0;
    // WARなどは記録がある全選手
    return (p.pa > 0 || (p.ip !== '0' && p.ip !== '0.0'));
  });

  // ソートロジック（ERAのみ昇順、他は降順）
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-flex items-center gap-1">← TOP</Link>
        
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic mb-6">{name} <span className="text-blue-600">Stats</span></h1>
          
          {/* 年度切り替え */}
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

          {/* 指標切り替え */}
          <div className="flex flex-wrap justify-center gap-2 pt-6 border-t">
            {['hits', 'hr', 'avg', 'ops', 'war', 'era', 'so', 'wins'].map(k => (
              <button 
                key={k} 
                onClick={() => setSortKey(k)} 
                className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === k ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border hover:bg-slate-50'}`}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic tracking-tighter uppercase">Fetching...</div>
          ) : sortedPlayers.length > 0 ? (
            sortedPlayers.map((p, index) => (
              <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl border group">
                <div className="flex items-center gap-6">
                  <div className={`text-4xl font-black italic w-12 text-center ${index === 0 ? 'text-yellow-400' : 'text-slate-100'}`}>{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-blue-500 uppercase">{p.team_name}</p>
                    <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">{p.player_name}</h2>
                    <p className="text-[11px] font-bold text-slate-400">{p.position}</p>
                  </div>
                  <div className="text-right border-l pl-6 min-w-[110px]">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{sortKey}</p>
                    <div className="text-3xl font-black italic text-slate-900">
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
          ) : (
            <div className="p-20 text-center text-slate-300 font-black italic uppercase">No Stats Recorded</div>
          )}
        </div>
      </div>
    </main>
  );
}