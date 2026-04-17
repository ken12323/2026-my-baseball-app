'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// --- 1. 型定義 ---
type League = 'ALL' | 'Central' | 'Pacific';
type Role = 'hitter' | 'pitcher';

interface PlayerRank {
  player_id: string;
  player_name: string;
  team_name: string;
  league: string;
  position: string;
  // 打撃
  avg?: number; hits?: number; hr?: number; rbi?: number; ops?: number; wrc_plus?: number;
  // 投手
  era?: number; wins?: number; so?: number; whip?: number; fip?: number;
  // 共通
  war: number;
  is_qualified: boolean;
}

const LEAGUE_MAP: Record<string, string> = {
  '広島東洋カープ': 'Central', '読売ジャイアンツ': 'Central', '阪神タイガース': 'Central',
  '横浜DeNAベイスターズ': 'Central', '中日ドラゴンズ': 'Central', '東京ヤクルトスワローズ': 'Central',
  '福岡ソフトバンクホークス': 'Pacific', '北海道日本ハムファイターズ': 'Pacific', '千葉ロッテマリーンズ': 'Pacific',
  '東北楽天ゴールデンイーグルス': 'Pacific', 'オリックス・バファローズ': 'Pacific', '埼玉西武ライオンズ': 'Pacific'
};

// --- 2. メインコンポーネント ---
function Leaderboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URLパラメータから状態を取得
  const role = (searchParams.get('role') as Role) || 'hitter';
  const league = (searchParams.get('league') as League) || 'ALL';
  const sortKey = searchParams.get('sort') || 'war';

  const [players, setPlayers] = useState<PlayerRank[]>([]);
  const [loading, setLoading] = useState(true);

  // 指標の定義
  const HITTER_METRICS = [
    { key: 'war', label: 'WAR' }, { key: 'avg', label: '打率' }, { key: 'hr', label: '本塁打' }, 
    { key: 'hits', label: '安打' }, { key: 'rbi', label: '打点' }, { key: 'ops', label: 'OPS' }, { key: 'wrc_plus', label: 'wRC+' }
  ];
  const PITCHER_METRICS = [
    { key: 'war', label: 'WAR' }, { key: 'era', label: '防御率' }, { key: 'so', label: '奪三振' }, 
    { key: 'wins', label: '勝利' }, { key: 'whip', label: 'WHIP' }, { key: 'fip', label: 'FIP' }
  ];
  const activeMetrics = role === 'hitter' ? HITTER_METRICS : PITCHER_METRICS;

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);
        const table = role === 'hitter' ? 'batting_stats' : 'pitching_stats';
        
        // 1. 2026年の成績を取得
        const { data: statsData } = await supabase.from(table).select('*').eq('年度', 2026);
        // 2. 選手基本情報を取得
        const { data: playersData } = await supabase.from('players').select('*');

        if (!statsData || !playersData) return;

        const combined: PlayerRank[] = statsData.map(s => {
          const stat = s as any;
          const p = playersData.find(player => String(player.player_id).padStart(8, '0') === String(stat.player_id).padStart(8, '0'));
          const team = stat.所属球団 || p?.team_name || '不明';
          
          // WARの取得（DBにあるカラム名を優先、なければ0）
          const warVal = role === 'hitter' 
            ? toF(stat['野手WAR'] || stat.war || stat.WAR) 
            : toF(stat['投手WAR'] || stat.war || stat.WAR);

          return {
            player_id: String(stat.player_id).padStart(8, '0'),
            player_name: stat.名前 || p?.player_name || '不明',
            team_name: team,
            league: LEAGUE_MAP[team] || 'Other',
            position: p?.position_detail || (role === 'hitter' ? '内野手' : '投手'),
            war: warVal,
            // 打撃指標
            avg: toF(stat.打率), hits: toF(stat.安打), hr: toF(stat.本塁打), rbi: toF(stat.打点), 
            ops: toF(stat.OPS || (toF(stat.出塁率) + toF(stat.長打率))), wrc_plus: toF(stat['wRC+']),
            // 投手指標
            era: toF(stat.防御率), wins: toF(stat.勝利), so: toF(stat.三振 || stat.奪三振), 
            whip: toF(stat.WHIP), fip: toF(stat.FIP),
            is_qualified: true // 一旦簡易化
          };
        });

        // リーグフィルター適用
        const filtered = league === 'ALL' ? combined : combined.filter(p => p.league === league);

        // ソート適用
        const sorted = filtered.sort((a, b) => {
          const valA = (a as any)[sortKey] ?? -999;
          const valB = (b as any)[sortKey] ?? -999;
          // 防御率・FIP・WHIPは低い順
          if (['era', 'fip', 'whip'].includes(sortKey)) return valA - valB;
          return valB - valA;
        });

        setPlayers(sorted.slice(0, 100)); // 上位100名
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [role, league, sortKey]);

  const toF = (val: any) => {
    const f = parseFloat(val);
    return isNaN(f) ? 0 : f;
  };

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key === 'role') params.set('sort', 'war'); // ロール変更時はWARにリセット
    router.push(`/ranking?${params.toString()}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 1. モード切替グローバルナビ */}
      <div className="flex bg-slate-200 p-1.5 rounded-2xl mb-6 shadow-inner">
        <Link href="/" className="flex-1 text-center py-3.5 rounded-xl text-sm font-black text-slate-500 hover:text-blue-900 transition-all flex items-center justify-center gap-2 hover:bg-slate-100/50">
          <span className="text-lg">🌱</span> ルーツ別
        </Link>
        <div className="flex-1 text-center py-3.5 rounded-xl text-sm font-black bg-white text-blue-900 shadow-sm flex items-center justify-center gap-2">
          <span className="text-lg">🏆</span> NPB総合
        </div>
      </div>

      {/* 2. フィルターセクション */}
      <div className="bg-white rounded-2xl shadow-xl border-t-8 border-orange-500 p-5 mb-6">
        <div className="flex flex-col gap-4">
          {/* 野手・投手切り替え */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => updateParam('role', 'hitter')} className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all ${role === 'hitter' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>野手ランキング</button>
            <button onClick={() => updateParam('role', 'pitcher')} className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all ${role === 'pitcher' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400'}`}>投手ランキング</button>
          </div>

          {/* リーグ切り替え */}
          <div className="flex gap-2">
            {(['ALL', 'Central', 'Pacific'] as League[]).map(l => (
              <button key={l} onClick={() => updateParam('league', l)} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${league === l ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400'}`}>
                {l === 'ALL' ? '両リーグ' : l === 'Central' ? 'セ・リーグ' : 'パ・リーグ'}
              </button>
            ))}
          </div>

          {/* 指標切り替え（横スクロール対応） */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {activeMetrics.map(m => (
              <button key={m.key} onClick={() => updateParam('sort', m.key)} className={`whitespace-nowrap px-5 py-2 rounded-full text-[10px] font-black transition-all ${sortKey === m.key ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. ランキングリスト */}
      {loading ? (
        <div className="text-center py-20 text-orange-500 font-black animate-pulse text-xl">NPBデータを解析中...</div>
      ) : (
        <div className="space-y-3 pb-20">
          {players.map((p, index) => (
            <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-orange-300 transition-all group">
              <div className="flex items-center gap-4">
                {/* 順位 */}
                <div className={`text-3xl font-black italic w-10 text-center ${index < 3 ? 'text-orange-500' : 'text-slate-200'}`}>
                  {index + 1}
                </div>

                {/* 選手メイン情報 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-blue-500 uppercase mb-0.5">{p.team_name}</p>
                  <h2 className="text-lg font-black text-slate-800 group-hover:text-blue-600 transition-colors leading-none mb-1.5">{p.player_name}</h2>
                  <div className="flex gap-2 text-[10px] font-bold text-slate-400">
                    <span>{p.position}</span>
                    <span className="border-l pl-2">2026年実績</span>
                  </div>
                </div>

                {/* メイン数値（右端） */}
                <div className="text-right border-l pl-4 min-w-[80px]">
                  <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{activeMetrics.find(m => m.key === sortKey)?.label}</p>
                  <div className="text-2xl font-black italic text-slate-900 leading-none">
                    {sortKey === 'avg' ? `.${String(p.avg?.toFixed(3)).split('.')[1]}` : 
                     sortKey === 'war' ? (p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)) : 
                     ['era', 'ops', 'whip', 'fip'].includes(sortKey) ? (p as any)[sortKey]?.toFixed(2) : 
                     (p as any)[sortKey]}
                  </div>
                </div>
              </div>
              
              {/* サブスタッツ（下段に細かく表示） */}
              <div className="mt-3 pt-3 border-t border-slate-50 flex gap-4 text-[10px] font-bold text-slate-500">
                {role === 'hitter' ? (
                  <>
                    <span>打率 .{String(p.avg?.toFixed(3)).split('.')[1]}</span>
                    <span>HR {p.hr}</span>
                    <span>打点 {p.rbi}</span>
                    <span className="ml-auto text-blue-600 bg-blue-50 px-2 py-0.5 rounded">WAR {p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)}</span>
                  </>
                ) : (
                  <>
                    <span>防御率 {p.era?.toFixed(2)}</span>
                    <span>勝利 {p.wins}</span>
                    <span>奪三振 {p.so}</span>
                    <span className="ml-auto text-red-600 bg-red-50 px-2 py-0.5 rounded">WAR {p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)}</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RankingPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <Suspense fallback={<div className="text-center py-20 font-black">Loading...</div>}>
        <Leaderboard />
      </Suspense>
      <footer className="mt-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">
        © 2026 BASEBALL ROOTS ANALYTICS
      </footer>
    </main>
  );
}