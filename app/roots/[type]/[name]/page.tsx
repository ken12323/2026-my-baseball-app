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
  active_year: string;
};

const toF = (val: any) => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

const normId = (id: any) => String(id || '').trim().replace(/^0+/, '');

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('hits'); // デフォルトは安打

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);

        // 1. 選手基本情報を取得
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

        // 2. データを3つのソースから一斉取得
        const [daily, batting, pitching] = await Promise.all([
          supabase.from('daily_performance').select('*').in('player_id', ids).gte('date', '2026-01-01'),
          supabase.from('batting_stats').select('*').in('player_id', ids),
          supabase.from('pitching_stats').select('*').in('player_id', ids)
        ]);

        // 3. マッチングと統合
        const combined = playerList.map(p => {
          const pid = normId(p.player_id);
          const isP = p.position_detail === '投手';

          // A. 2026年リアルタイム集計 (H, HR)
          const myDaily = (daily.data || []).filter(d => normId(d.player_id) === pid);
          const realHits = myDaily.reduce((sum, d) => sum + toF(d.h_hits), 0);
          const realHR = myDaily.reduce((sum, d) => sum + toF(d.h_hr), 0);

          // B. 年度別統計 (WAR, AVG, ERAなど)
          // 2026年があれば最優先、なければ最新年度を取得
          const bAll = (batting.data || []).filter(s => normId(s.player_id) === pid).sort((a,b) => toF(b.年度) - toF(a.年度));
          const pAll = (pitching.data || []).filter(s => normId(s.player_id) === pid).sort((a,b) => toF(b.年度) - toF(a.年度));
          
          const bStat = bAll[0];
          const pStat = pAll[0];
          const bestStat = isP ? pStat : bStat;

          return {
            player_id: p.player_id,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            active_year: bestStat ? String(bestStat.年度) : '2026',
            // H/HRは2026年リアルタイム。ただしリアルタイムが0なら集計表の数値を使う
            hits: realHits || toF(bStat?.安打),
            hr: realHR || toF(bStat?.本塁打),
            // その他の指標は集計表から取得
            war: isP ? toF(pStat?.投手WAR) : toF(bStat?.野手WAR),
            avg: toF(bStat?.打率),
            ops: toF(bStat?.OPS),
            era: isP ? (toF(pStat?.防御率) === 0 ? 99.99 : toF(pStat?.防御率)) : 99.99,
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
  }, [type, name]);

  // 並び替え
  const sortedPlayers = [...players].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  const SortButton = ({ k, label }: { k: string, label: string }) => (
    <button 
      onClick={() => setSortKey(k)}
      className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === k ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}
    >
      {label}
    </button>
  );

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic">LOADING {name.toUpperCase()}...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-block hover:opacity-70">← TOPへ戻る</Link>
        
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic text-slate-900 tracking-tighter leading-none mb-8">
            {name} <span className="text-blue-600">Ranking</span>
          </h1>
          
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            <SortButton k="war" label="貢献度(WAR)" />
            <SortButton k="hits" label="安打" />
            <SortButton k="hr" label="本塁打" />
            <SortButton k="avg" label="打率" />
            <SortButton k="ops" label="OPS" />
            <SortButton k="era" label="防御率" />
            <SortButton k="so" label="三振" />
            <SortButton k="wins" label="勝利" />
          </div>
        </header>

        <div className="space-y-4">
          {sortedPlayers.map((p, index) => (
            <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all border border-slate-100 group">
              <div className="flex items-center gap-6">
                <div className={`text-4xl font-black italic w-12 text-center ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-100'}`}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-500 uppercase">{p.team_name}</p>
                  <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">{p.player_name}</h2>
                  <div className="flex gap-2 mt-1">
                     <span className="text-[10px] font-bold text-slate-400">{p.position}</span>
                     <span className="text-[9px] bg-blue-50 text-blue-400 px-1.5 py-0.5 rounded font-black">{p.active_year} Season</span>
                  </div>
                </div>
                <div className="text-right border-l border-slate-50 pl-6 min-w-[110px]">
                  <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{sortKey}</p>
                  <div className="text-3xl font-black italic leading-none text-slate-900">
                    {sortKey === 'war' && (p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1))}
                    {sortKey === 'hits' && p.hits}
                    {sortKey === 'hr' && p.hr}
                    {sortKey === 'avg' && `.${String(p.avg.toFixed(3)).split('.')[1]}`}
                    {sortKey === 'ops' && p.ops.toFixed(3)}
                    {sortKey === 'era' && (p.era > 90 ? '-.--' : p.era.toFixed(2))}
                    {sortKey === 'so' && p.so}
                    {sortKey === 'wins' && p.wins}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}