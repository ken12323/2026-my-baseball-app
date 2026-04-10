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
  is_pitcher: boolean;
};

const toF = (val: any) => parseFloat(val) || 0;

export default function RootsRankingPage() {
  const params = useParams();
  const type = params.type as string;
  const rawName = decodeURIComponent(params.name as string);
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('hits'); // 2026年は安打順をデフォルトに

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

        // 1. カテゴリに該当する選手を Players テーブルから取得
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

        const ids = playerList.map(p => String(p.player_id).trim());

        // 2. 2026年の全日程の「日次成績」を取得 (TOPページと同じソース)
        const { data: dailyData } = await supabase
          .from('daily_performance')
          .select('*')
          .in('player_id', ids)
          .gte('date', '2026-01-01');

        // 3. 2025年度以前の「過去成績」を取得 (WARなどの参考用)
        const { data: pastStats } = await supabase
          .from('batting_stats')
          .select('*')
          .in('player_id', ids);

        // 4. マッチングと2026年の合計計算
        const combined = playerList.map(p => {
          const pid = String(p.player_id).trim();
          
          // 2026年の日次成績を合計する (これがTOPページの数字の正体)
          const pPerf = (dailyData || []).filter(d => String(d.player_id).trim() === pid);
          const totalHits = pPerf.reduce((sum, d) => sum + toF(d.h_hits), 0);
          const totalHR = pPerf.reduce((sum, d) => sum + toF(d.h_hr), 0);

          // 最新の年度の成績を取得 (WARなどのため)
          const latestPast = (pastStats || [])
            .filter(s => String(s.player_id).trim() === pid)
            .sort((a, b) => b.年度 - a.年度)[0];

          return {
            player_id: p.player_id,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: p.position_detail === '投手',
            // 2026年リアルタイム集計値
            hits: totalHits,
            hr: totalHR,
            // 参考値 (最新の年度データがあれば使用)
            war: toF(latestPast?.野手WAR || latestPast?.投手WAR),
            avg: toF(latestPast?.打率),
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

  const sortedPlayers = [...players].sort((a, b) => (b as any)[sortKey] - (a as any)[sortKey]);

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic">SYNCING REAL-TIME DATA...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-block">← TOPへ戻る</Link>
        
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic text-slate-900 tracking-tighter leading-none">
            {name} <span className="text-blue-600">Ranking</span>
          </h1>
          <p className="text-slate-400 font-bold mt-4 uppercase text-[10px] tracking-[0.3em]">2026 Season Real-time Analysis</p>
          
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            <button onClick={() => setSortKey('hits')} className={`px-5 py-2 rounded-xl text-[11px] font-black transition-all ${sortKey === 'hits' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border text-slate-400'}`}>HITS (2026)</button>
            <button onClick={() => setSortKey('hr')} className={`px-5 py-2 rounded-xl text-[11px] font-black transition-all ${sortKey === 'hr' ? 'bg-red-600 text-white shadow-lg' : 'bg-white border text-slate-400'}`}>HR (2026)</button>
            <button onClick={() => setSortKey('war')} className={`px-5 py-2 rounded-xl text-[11px] font-black transition-all ${sortKey === 'war' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border text-slate-400'}`}>CAREER WAR</button>
          </div>
        </header>

        <div className="space-y-4">
          {sortedPlayers.map((p, index) => (
            <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all border border-slate-100 group">
              <div className="flex items-center gap-6">
                <div className={`text-4xl font-black italic w-12 text-center ${index === 0 ? 'text-yellow-400' : 'text-slate-100'}`}>{index + 1}</div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-500 uppercase">{p.team_name}</p>
                  <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">{p.player_name}</h2>
                  <p className="text-[11px] font-bold text-slate-400">{p.position}</p>
                </div>
                <div className="text-right border-l pl-6 min-w-[120px]">
                  <p className="text-[9px] font-black text-slate-300 uppercase mb-1">2026 SEASON</p>
                  <div className="flex flex-col">
                    <span className={`text-3xl font-black italic leading-none ${sortKey === 'hits' ? 'text-blue-900' : 'text-slate-400'}`}>{p.hits}<span className="text-[10px] ml-1 not-italic">H</span></span>
                    <span className={`text-xl font-black italic mt-1 ${sortKey === 'hr' ? 'text-red-600' : 'text-slate-400'}`}>{p.hr}<span className="text-[10px] ml-1 not-italic">HR</span></span>
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