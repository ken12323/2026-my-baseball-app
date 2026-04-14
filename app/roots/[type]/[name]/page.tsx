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
  games: number; pa: number; hits: number; hr: number; rbi: number; sb: number;
  avg: number; ops: number; wrc_plus: number; war: number;
  era: number; so: number; wins: number; sv: number; hp: number; k_bb: number; ip: string;
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

const FULL_TO_SHORT: Record<string, string[]> = {
  '阪神タイガース': ['阪神', '阪　神'],
  '読売ジャイアンツ': ['巨人', '読　売'],
  '東京ヤクルトスワローズ': ['ヤクルト', '東京ヤクルト'],
  '横浜DeNAベイスターズ': ['DeNA', '横浜DeNA'],
  '中日ドラゴンズ': ['中日', '中　日'],
  '広島東洋カープ': ['広島', '広島東洋'],
  '埼玉西武ライオンズ': ['西武', '埼玉西武'],
  '千葉ロッテマリーンズ': ['ロッテ', '千葉ロッテ'],
  '北海道日本ハムファイターズ': ['日本ハム', '北海道日本ハム'],
  'オリックス・バファローズ': ['オリックス'],
  '福岡ソフトバンクホークス': ['ソフトバンク', '福岡ソフトバンク'],
  '東北楽天ゴールデンイーグルス': ['楽天', '東北楽天']
};

const SORT_OPTIONS: Record<string, string> = {
  hits: '安打', hr: '本塁打', rbi: '打点', sb: '盗塁', avg: '打率', ops: 'OPS', wrc_plus: 'wRC+', war: 'WAR', 
  era: '防御率', so: '三振', wins: '勝利', sv: 'セーブ', hp: 'HP', k_bb: 'K-BB%'
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
        let globalMax = 0;

        maxGamesData?.forEach(r => {
          const row = r as any;
          const t = row['所属球団'] || '';
          const g = parseInt(row['試合']) || 0;
          if (g > globalMax) globalMax = g;
          if (!teamGames[t] || g > teamGames[t]) teamGames[t] = g;
        });

        let query = supabase.from('players').select('*');
        if (type === 'high_school') query = query.eq('high_school', name);
        else if (type === 'university') query = query.eq('university', name);
        else if (type === 'hometown') query = query.eq('hometown', name);
        else if (type === 'draft') query = query.eq('draft_year', name);
        else if (type === 'previous_team') query = query.or(`prev_team_1.eq.${name},prev_team_2.eq.${name},prev_team_3.eq.${name}`);

        const { data: playerList } = await query;
        if (!playerList || playerList.length === 0) return;

        const uniqueIds = Array.from(new Set(playerList.map(p => String(p.player_id).padStart(8, '0'))));

        const [bRes, pRes] = await Promise.all([
          supabase.from('batting_stats').select('*').in('player_id', uniqueIds).eq('年度', selectedYear),
          supabase.from('pitching_stats').select('*').in('player_id', uniqueIds).eq('年度', selectedYear)
        ]);

        const combined = playerList.map(p => {
          const safeId = String(p.player_id).padStart(8, '0');
          const isP = p.position_detail?.includes('投手');
          const b = (bRes.data?.find(s => String(s.player_id).padStart(8, '0') === safeId) || {}) as any;
          const pt = (pRes.data?.find(s => String(s.player_id).padStart(8, '0') === safeId) || {}) as any;

          const shortNames = FULL_TO_SHORT[p.team_name] || [p.team_name];
          let teamGameCount = 0;
          for (const sn of shortNames) {
            if (teamGames[sn]) { teamGameCount = teamGames[sn]; break; }
          }
          if (teamGameCount === 0) teamGameCount = globalMax;

          const isQualified = isP 
            ? toF(pt['投球回']) >= teamGameCount 
            : toF(b['打席']) >= Math.floor(teamGameCount * 3.1);

          const rawEra = parseFloat(pt['防御率']);

          return {
            player_id: safeId,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            is_qualified: isQualified,
            games: toF(b['試合'] || pt['登板']),
            pa: toF(b['打席']),
            hits: toF(b['安打']),
            hr: toF(b['本塁打']),
            rbi: toF(b['打点']),
            sb: toF(b['盗塁']),
            avg: toF(b['打率']),
            ops: toF(b['OPS']),
            wrc_plus: toF(b['wRC+']),
            war: isP ? findValue(pt, ['投手WAR', 'war', 'WAR']) : findValue(b, ['野手WAR', 'war', 'WAR']),
            era: isP ? (isNaN(rawEra) ? 99.99 : rawEra) : 99.99,
            so: toF(pt['三振'] || pt['奪三振']),
            wins: toF(pt['勝利']),
            sv: toF(pt['セーブ']),
            hp: toF(pt['ホールドポイント'] || pt['HP']),
            k_bb: toF(pt['K-BB%']),
            ip: String(pt['投球回'] || '0')
          };
        });
        setPlayers(combined);
      } finally { setLoading(false); }
    }
    fetchRanking();
  }, [type, name, selectedYear]);

  const filtered = players.filter(p => {
    const hasRecord = p.games > 0 || p.pa > 0 || (p.ip !== '0' && p.ip !== '');
    const isPitchKey = ['era', 'so', 'wins', 'sv', 'hp', 'k_bb'].includes(sortKey);
    const isBatKey = ['hits', 'hr', 'rbi', 'sb', 'avg', 'ops', 'wrc_plus'].includes(sortKey);
    if (isPitchKey) return p.is_pitcher && hasRecord;
    if (isBatKey) return !p.is_pitcher && hasRecord;
    return hasRecord;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'era') return a.era - b.era;
    if ((b as any)[sortKey] === (a as any)[sortKey]) return b.war - a.war;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  // 規定による分割の判定
  const useSplit = ['avg', 'ops', 'wrc_plus', 'war', 'era', 'k_bb'].includes(sortKey);
  const qual = sorted.filter(p => p.is_qualified);
  const unqual = sorted.filter(p => !p.is_qualified);

  const renderCard = (p: RankedPlayer, index: number, applyStyle: boolean) => {
    const isDim = applyStyle && !p.is_qualified;
    return (
      <Link href={`/player/${p.player_id}`} key={p.player_id} className={`block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl border group transition-all ${isDim ? 'opacity-80 hover:opacity-100 bg-slate-50/50' : ''}`}>
        <div className="flex items-center gap-4 md:gap-8">
          <div className={`text-4xl md:text-5xl font-black italic w-12 text-center ${index === 0 && (!applyStyle || p.is_qualified) ? 'text-yellow-400' : 'text-slate-200'}`}>{index + 1}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-blue-500 uppercase mb-1">{p.team_name}</p>
            <div className="flex items-baseline gap-2 mb-3 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 group-hover:text-blue-600 leading-none">{p.player_name}</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase">{p.position}</span>
              {isDim && <span className="text-[9px] font-black bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100">規定未満</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-black text-slate-400 uppercase tracking-tighter border-t pt-2">
              <div className="flex gap-2">
                {p.is_pitcher ? <span>{p.games}登板 {p.ip}回</span> : <span>{p.games}試合 {p.pa}打席 {p.hits}安打 {p.hr}HR {p.rbi}打点 {p.sb}盗塁</span>}
              </div>
              <div className="flex gap-2 border-l pl-3 text-slate-900 font-bold">
                {p.is_pitcher ? (
                  <>防 {p.era > 90 ? '-.--' : p.era.toFixed(2)} | {p.so}三振 | {p.wins}勝 | {p.sv}S | {p.hp}HP | K-BB {p.k_bb.toFixed(1)}%</>
                ) : (
                  <>打率 .{String(p.avg.toFixed(3)).split('.')[1]} | OPS {p.ops.toFixed(3)} | wRC+ {Math.round(p.wrc_plus)}</>
                )}
                <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded italic font-black">WAR {p.war >= 0 ? `+${p.war.toFixed(1)}` : p.war.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <div className="text-right border-l pl-6 min-w-[110px]">
            <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{SORT_OPTIONS[sortKey]}</p>
            <div className="text-3xl md:text-4xl font-black italic text-slate-900 leading-none">
              {sortKey === 'avg' ? `.${String(p.avg.toFixed(3)).split('.')[1]}` : 
               sortKey === 'era' ? (p.era > 90 ? '-.--' : p.era.toFixed(2)) : 
               sortKey === 'k_bb' ? `${p.k_bb.toFixed(1)}%` : 
               Math.round((p as any)[sortKey] * 100) / 100}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900 font-sans tracking-tight">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-flex items-center gap-1 text-sm">← TOP</Link>
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic mb-6">{name} <span className="text-blue-600">Stats</span></h1>
          <div className="flex flex-wrap justify-center gap-2 pt-6 border-t">
            {Object.entries(SORT_OPTIONS).map(([key, label]) => (
              <button key={key} onClick={() => setSortKey(key)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === key ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic tracking-tighter uppercase">Fetching...</div>
          ) : sorted.length > 0 ? (
            useSplit ? (
              <>
                {qual.map((p, i) => renderCard(p, i, true))}
                {unqual.length > 0 && (
                  <>
                    <div className="pt-10 pb-4 flex items-center gap-4"><div className="h-[2px] bg-slate-200 flex-1"></div><h3 className="text-slate-400 font-black text-sm tracking-widest uppercase">参考記録（規定未満）</h3><div className="h-[2px] bg-slate-200 flex-1"></div></div>
                    {unqual.map((p, i) => renderCard(p, qual.length + i, true))}
                  </>
                )}
              </>
            ) : (
              sorted.map((p, i) => renderCard(p, i, false))
            )
          ) : (
            <div className="p-20 text-center text-slate-300 font-black italic uppercase">No Stats Recorded</div>
          )}
        </div>
      </div>
    </main>
  );
}