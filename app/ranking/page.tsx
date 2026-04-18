'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// --- 1. 型定義 ---
type League = 'ALL' | 'Central' | 'Pacific';
type Role = 'hitter' | 'pitcher';
type FilterType = 'qualified' | 'half' | 'rookie' | 'all';

interface PlayerRank {
  player_id: string;
  player_name: string;
  team_name: string;
  league: string;
  position: string;
  
  // 打撃
  pa?: number; hits?: number; double?: number; triple?: number; hr?: number; 
  rbi?: number; sb?: number; bb?: number; hbp?: number; so_bat?: number;
  avg?: number; obp?: number; slg?: number; ops?: number; woba?: number; isop?: number; wrc_plus?: number;
  
  // 投手
  games?: number; ip_str?: string; wins?: number; losses?: number; sv?: number; hp?: number;
  hits_allowed?: number; bb_allowed?: number; so_pitch?: number; runs?: number; er?: number;
  era?: number; whip?: number; k9?: number; bb9?: number; k_bb_pct?: number; fip?: number;
  
  // 共通
  war: number;
}

// ★ 修正箇所：全角スペース（阪　神、読　売など）を除去してから判定する
const getLeague = (teamName: string): League | 'Other' => {
  const cleanTeam = teamName.replace(/[\s　]+/g, '');
  const central = ['広島', 'カープ', '読売', '巨人', 'ジャイアンツ', '阪神', 'タイガース', 'DeNA', 'ベイスターズ', '中日', 'ドラゴンズ', 'ヤクルト', 'スワローズ'];
  const pacific = ['ソフトバンク', 'ホークス', '日本ハム', 'ファイターズ', 'ロッテ', 'マリーンズ', '楽天', 'イーグルス', 'オリックス', 'バファローズ', '西武', 'ライオンズ'];
  
  if (central.some(name => cleanTeam.includes(name))) return 'Central';
  if (pacific.some(name => cleanTeam.includes(name))) return 'Pacific';
  return 'Other';
};

const toF = (val: any): number => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

const formatIP = (ipStr: any): number => {
  const s = String(ipStr);
  if (!s.includes('.')) return toF(s);
  const [int, frac] = s.split('.').map(Number);
  return int + (frac === 1 ? 0.333 : frac === 2 ? 0.666 : 0);
};

// --- 2. メインコンポーネント ---
function Leaderboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URLパラメータから状態を取得
  const role = (searchParams.get('role') as Role) || 'hitter';
  const league = (searchParams.get('league') as League) || 'ALL';
  const sortKey = searchParams.get('sort') || 'war';
  const filterType = (searchParams.get('filter') as FilterType) || 'qualified';

  const [players, setPlayers] = useState<PlayerRank[]>([]);
  const [loading, setLoading] = useState(true);

  // 指標の定義
  const HITTER_METRICS = [
    { key: 'war', label: 'WAR' }, { key: 'avg', label: '打率' }, { key: 'hr', label: '本塁打' }, 
    { key: 'hits', label: '安打' }, { key: 'rbi', label: '打点' }, { key: 'ops', label: 'OPS' }, 
    { key: 'wrc_plus', label: 'wRC+' }, { key: 'woba', label: 'wOBA' }, { key: 'isop', label: 'ISOp' }
  ];
  const PITCHER_METRICS = [
    { key: 'war', label: 'WAR' }, { key: 'era', label: '防御率' }, { key: 'so_pitch', label: '奪三振' }, 
    { key: 'wins', label: '勝利' }, { key: 'sv', label: 'セーブ' }, { key: 'hp', label: 'HP' }, 
    { key: 'k_bb_pct', label: 'K-BB%' }, { key: 'k9', label: 'K/9' }, { key: 'bb9', label: 'BB/9' },
    { key: 'whip', label: 'WHIP' }, { key: 'fip', label: 'FIP' }
  ];
  const activeMetrics = role === 'hitter' ? HITTER_METRICS : PITCHER_METRICS;

  useEffect(() => {
    async function fetchRanking() {
      try {
        setLoading(true);
        const table = role === 'hitter' ? 'batting_stats' : 'pitching_stats';
        
        const [{ data: statsData }, { data: playersData }, { data: gamesData }] = await Promise.all([
          supabase.from(table).select('*').eq('年度', 2026),
          supabase.from('players').select('*'),
          supabase.from('batting_stats').select('所属球団, 試合').eq('年度', 2026)
        ]);

        if (!statsData || !playersData) return;

        const teamGames: Record<string, number> = {};
        let globalMaxGames = 143; 
        if (gamesData) {
          gamesData.forEach((row: any) => {
            const t = row.所属球団;
            const g = parseInt(row.試合) || 0;
            if (!teamGames[t] || g > teamGames[t]) teamGames[t] = g;
          });
          const maxVals = Object.values(teamGames);
          if(maxVals.length > 0) globalMaxGames = Math.max(...maxVals);
        }

        const processed: PlayerRank[] = [];

        statsData.forEach(s => {
          const stat = s as any;
          const p = playersData.find(player => String(player.player_id).padStart(8, '0') === String(stat.player_id).padStart(8, '0'));
          const team = stat.所属球団 || p?.team_name || '不明';
          const pos = p?.position_detail || (role === 'hitter' ? '内野手' : '投手');

          if (role === 'hitter' && pos.includes('投手')) return;

          const teamGameCount = teamGames[team] || globalMaxGames;
          let is_qualified = false;
          let is_half_qualified = false;

          const warVal = role === 'hitter' 
            ? toF(stat['野手WAR'] || stat.war || stat.WAR) 
            : toF(stat['投手WAR'] || stat.war || stat.WAR);

          const is_rookie = p?.draft_year && String(p.draft_year).includes('2025');

          const currentLeague = getLeague(team);

          if (role === 'hitter') {
            const pa = toF(stat.打席);
            is_qualified = pa >= Math.floor(teamGameCount * 3.1);
            is_half_qualified = pa >= Math.floor((teamGameCount * 3.1) / 2);

            if (filterType === 'qualified' && !is_qualified) return;
            if (filterType === 'half' && !is_half_qualified) return;
            if (filterType === 'rookie' && !is_rookie) return;

            const hits = toF(stat.安打);
            const dbl = toF(stat.二塁打);
            const tpl = toF(stat.三塁打);
            const hr = toF(stat.本塁打);
            const bb = toF(stat.四球);
            const hbp = toF(stat.死球);
            const avg = toF(stat.打率);
            const slg = toF(stat.長打率);
            
            const wobaVal = pa > 0 ? (0.7 * bb + 0.72 * hbp + 0.9 * (hits - dbl - tpl - hr) + 1.25 * dbl + 1.6 * tpl + 2.0 * hr) / pa : 0;
            const isopVal = slg - avg;

            processed.push({
              player_id: String(stat.player_id).padStart(8, '0'),
              player_name: stat.名前 || p?.player_name || '不明',
              team_name: team, league: currentLeague, position: pos,
              war: warVal, pa, hits, double: dbl, triple: tpl, hr, rbi: toF(stat.打点), sb: toF(stat.盗塁),
              bb, hbp, so_bat: toF(stat.三振), avg, obp: toF(stat.出塁率), slg, ops: toF(stat.OPS || (toF(stat.出塁率) + slg)),
              woba: wobaVal, isop: isopVal, wrc_plus: toF(stat['wRC+'])
            });

          } else {
            const ipStr = String(stat.投球回 || '0');
            const ip = formatIP(ipStr);

            is_qualified = ip >= teamGameCount;
            is_half_qualified = ip >= (teamGameCount / 2);

            if (filterType === 'qualified' && !is_qualified) return;
            if (filterType === 'half' && !is_half_qualified) return;
            if (filterType === 'rookie' && !is_rookie) return;

            const walks = toF(stat.与四球 || stat.四球);
            const hitsAllowed = toF(stat.被安打 || stat.安打);
            const so = toF(stat.三振 || stat.奪三振);
            const hbp = toF(stat.死球 || stat.与死球);
            const batters = toF(stat.打者) || (ip > 0 ? Math.round(ip * 3 + hitsAllowed + walks + hbp) : 0);

            processed.push({
              player_id: String(stat.player_id).padStart(8, '0'),
              player_name: stat.名前 || p?.player_name || '不明',
              team_name: team, league: currentLeague, position: pos,
              war: warVal, games: toF(stat.登板), ip_str: ipStr, wins: toF(stat.勝利), losses: toF(stat.敗北),
              sv: toF(stat.セーブ), hp: toF(stat.ホールドポイント || stat.HP), hits_allowed: hitsAllowed,
              bb_allowed: walks, so_pitch: so, runs: toF(stat.失点), er: toF(stat.自責点),
              era: toF(stat.防御率), whip: ip > 0 ? (walks + hitsAllowed) / ip : 0,
              k9: ip > 0 ? (so * 9) / ip : 0, bb9: ip > 0 ? (walks * 9) / ip : 0,
              k_bb_pct: batters > 0 ? ((so - walks) / batters) * 100 : 0, fip: toF(stat.FIP)
            });
          }
        });

        const filtered = league === 'ALL' ? processed : processed.filter(p => p.league === league);

        const sorted = filtered.sort((a, b) => {
          const valA = (a as any)[sortKey] ?? -999;
          const valB = (b as any)[sortKey] ?? -999;
          if (['era', 'fip', 'whip', 'bb9'].includes(sortKey)) return valA - valB;
          return valB - valA;
        });

        setPlayers(sorted.slice(0, 100)); 
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [role, league, sortKey, filterType]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key === 'role') params.set('sort', 'war'); 
    router.push(`/ranking?${params.toString()}`);
  };

  const formatMainStat = (key: string, value: number) => {
    if (value === undefined || isNaN(value)) return '-';
    if (['avg', 'woba', 'isop'].includes(key)) {
      const s = value.toFixed(3);
      return s.startsWith('0.') ? s.substring(1) : s.startsWith('-0.') ? '-' + s.substring(2) : s;
    }
    if (key === 'ops') return value.toFixed(3);
    if (key === 'k_bb_pct') return `${value.toFixed(1)}%`;
    if (['era', 'whip', 'k9', 'bb9', 'fip'].includes(key)) return value > 90 ? '-.--' : value.toFixed(2);
    if (key === 'war') return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
    return Math.round(value);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex bg-slate-200 p-1.5 rounded-2xl mb-6 shadow-inner">
        <Link href="/" className="flex-1 text-center py-3.5 rounded-xl text-sm font-black text-slate-500 hover:text-blue-900 transition-all flex items-center justify-center gap-2 hover:bg-slate-100/50">
          <span className="text-lg">🌱</span> ルーツ別
        </Link>
        <div className="flex-1 text-center py-3.5 rounded-xl text-sm font-black bg-white text-blue-900 shadow-sm flex items-center justify-center gap-2">
          <span className="text-lg">🏆</span> NPB総合
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border-t-8 border-orange-500 p-5 mb-6">
        <div className="flex flex-col gap-4">
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => updateParam('role', 'hitter')} className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all ${role === 'hitter' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>野手ランキング</button>
            <button onClick={() => updateParam('role', 'pitcher')} className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all ${role === 'pitcher' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400'}`}>投手ランキング</button>
          </div>

          <div className="flex gap-2">
            {(['ALL', 'Central', 'Pacific'] as League[]).map(l => (
              <button key={l} onClick={() => updateParam('league', l)} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${league === l ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400'}`}>
                {l === 'ALL' ? '両リーグ' : l === 'Central' ? 'セ・リーグ' : 'パ・リーグ'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {(['qualified', 'half', 'rookie', 'all'] as FilterType[]).map(f => (
              <button key={f} onClick={() => updateParam('filter', f)} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${filterType === f ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                {f === 'qualified' ? '規定以上' : f === 'half' ? '規定1/2以上' : f === 'rookie' ? 'ルーキー' : 'すべて'}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {activeMetrics.map(m => (
              <button key={m.key} onClick={() => updateParam('sort', m.key)} className={`whitespace-nowrap px-5 py-2 rounded-full text-[10px] font-black transition-all ${sortKey === m.key ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-orange-500 font-black animate-pulse text-xl">NPBデータを解析中...</div>
      ) : players.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-400 font-black">条件に一致する選手がいません</div>
      ) : (
        <div className="space-y-3 pb-20">
          {players.map((p, index) => (
            <Link href={`/player/${p.player_id}`} key={p.player_id} className="block bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-orange-300 transition-all group">
              <div className="flex items-center gap-4">
                <div className={`text-3xl font-black italic w-10 text-center ${index < 3 ? 'text-orange-500' : 'text-slate-200'}`}>
                  {index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-blue-500 uppercase mb-0.5">{p.team_name}</p>
                  <h2 className="text-lg font-black text-slate-800 group-hover:text-blue-600 transition-colors leading-none mb-1.5">{p.player_name}</h2>
                  <div className="flex gap-2 text-[10px] font-bold text-slate-400">
                    <span>{p.position}</span>
                    <span className="border-l pl-2">2026年実績</span>
                  </div>
                </div>

                <div className="text-right border-l pl-4 min-w-[80px]">
                  <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{activeMetrics.find(m => m.key === sortKey)?.label}</p>
                  <div className="text-2xl font-black italic text-slate-900 leading-none">
                    {formatMainStat(sortKey, (p as any)[sortKey])}
                  </div>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-slate-50 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] font-bold text-slate-500">
                {role === 'hitter' ? (
                  <>
                    <span className="text-slate-700">打率 <span className="font-black">{formatMainStat('avg', p.avg || 0)}</span></span>
                    <span>{p.pa}打席</span>
                    <span>{p.hits}安打</span>
                    <span>{p.hr}HR</span>
                    <span>{p.rbi}打点</span>
                    <span>{p.sb}盗塁</span>
                    <span>{p.bb}四球</span>
                    <span>{p.so_bat}三振</span>
                    <span className="border-l pl-3 text-slate-700">OPS <span className="font-black">{p.ops?.toFixed(3)}</span></span>
                    <span>wOBA <span className="font-black">{formatMainStat('woba', p.woba || 0)}</span></span>
                    <span>wRC+ <span className="font-black text-orange-600">{p.wrc_plus}</span></span>
                    <span className="ml-auto text-blue-600 bg-blue-50 px-2 py-0.5 rounded">WAR {p.war > 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-700">防 <span className="font-black">{p.era?.toFixed(2)}</span></span>
                    <span>{p.games}登板</span>
                    <span>{p.wins}勝 {p.losses}敗 {p.sv}S {p.hp}HP</span>
                    <span>{p.ip_str}回</span>
                    <span>{p.so_pitch}奪三振</span>
                    <span className="border-l pl-3 text-slate-700">WHIP <span className="font-black">{p.whip?.toFixed(2)}</span></span>
                    <span>K/9 <span className="font-black">{p.k9?.toFixed(2)}</span></span>
                    <span>K-BB <span className="font-black text-orange-600">{p.k_bb_pct?.toFixed(1)}%</span></span>
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