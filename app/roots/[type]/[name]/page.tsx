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
  const name = rawName.replace('年指名', '').replace('年', '');

  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('war'); 

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);
        console.log(`🔍 検索開始: カテゴリ=${type}, 名前=${name}`);

        // 1. 選手リストを取得
        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

        const { data: playerList, error: pErr } = await query;
        if (pErr || !playerList || playerList.length === 0) {
          console.error("❌ 選手が見つかりません:", pErr);
          setPlayers([]);
          setLoading(false);
          return;
        }

        const playerIds = playerList.map(p => p.player_id);
        console.log("👤 取得選手ID一覧:", playerIds);

        // 2. 成績を取得 (あえて'年度'の型不一致を避けるため、後でJSでフィルタリング)
        const [batting, pitching] = await Promise.all([
          supabase.from('batting_stats').select('*').in('player_id', playerIds),
          supabase.from('pitching_stats').select('*').in('player_id', playerIds)
        ]);

        console.log("📊 取得打撃データ数:", batting.data?.length || 0);
        console.log("⚾ 取得投手データ数:", pitching.data?.length || 0);

        // 3. マッチング
        const combined = playerList.map(p => {
          // IDを正規化して比較 (数値と文字列の差異を吸収)
          const normalize = (id: any) => String(id).replace(/^0+/, '');
          const pid = normalize(p.player_id);

          // 2026年度のデータを抽出
          const b = batting.data?.find(s => normalize(s.player_id) === pid && String(s.年度) === '2026');
          const pi = pitching.data?.find(s => normalize(s.player_id) === pid && String(s.年度) === '2026');
          
          if (!b && !pi) console.warn(`⚠️ 選手ID ${pid} (${p.player_name}) の2026年データが見つかりません`);

          const isP = p.position_detail === '投手';

          return {
            player_id: p.player_id,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            war: isP ? toF(pi?.投手WAR) : toF(b?.野手WAR),
            hits: toF(b?.安打),
            hr: toF(b?.本塁打),
            avg: toF(b?.打率),
            ops: toF(b?.OPS),
            era: isP ? (toF(pi?.防御率) === 0 ? 99.99 : toF(pi?.防御率)) : 99.99,
            so: toF(pi?.三振),
            wins: toF(pi?.勝利)
          };
        });

        setPlayers(combined);
      } catch (err) {
        console.error("❌ システムエラー:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [type, name]);

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era;
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

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic">ANALYZING ROOTS...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-block">← TOPへ戻る</Link>
        
        <header className="mb-12 text-center">
          <div className="inline-block bg-blue-600 text-white px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm mb-4">
            Category Ranking
          </div>
          <h1 className="text-5xl md:text-7xl font-black italic text-slate-900 tracking-tighter leading-none">
            {name}{type === 'draft' && '年ドラフト'}
          </h1>
          
          <div className="mt-10">
            <div className="flex flex-wrap justify-center gap-2">
              <SortButton k="war" label="貢献度(WAR)" />
              <SortButton k="hits" label="安打" />
              <SortButton k="hr" label="本塁打" />
              <SortButton k="avg" label="打率" />
              <SortButton k="ops" label="OPS" />
              <SortButton k="era" label="防御率" />
              <SortButton k="so" label="三振" />
              <SortButton k="wins" label="勝利" />
            </div>
          </div>
        </header>

        <div className="space-y-4">
          {sortedPlayers.length > 0 ? (
            sortedPlayers.map((p, index) => (
              <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all border border-slate-100 group">
                <div className="flex items-center gap-6">
                  <div className="w-12 text-center">
                    <span className={`text-4xl font-black italic ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-100'}`}>
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-blue-500 uppercase">{p.team_name}</p>
                    <h2 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">{p.player_name}</h2>
                    <p className="text-[11px] font-bold text-slate-400 mt-1">{p.position}</p>
                  </div>
                  <div className="text-right min-w-[100px] border-l border-slate-50 pl-6">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{sortKey}</p>
                    <div className="text-3xl font-black italic leading-none">
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
            ))
          ) : (
            <div className="bg-white rounded-[2rem] p-20 text-center text-slate-300 font-black">選手データがありません</div>
          )}
        </div>
      </div>
    </main>
  );
}