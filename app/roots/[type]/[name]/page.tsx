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
  team_games: number;
  draft_year: string; 
  birth_date: string; 
  age: number | null; 
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

// 年齢を計算する関数
const calculateAge = (birthDateStr: string | undefined | null) => {
  if (!birthDateStr) return null;
  const match = String(birthDateStr).match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    age--; 
  }
  return age;
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
  era: '防御率', so: '三振', wins: '勝利', sv: 'セーブ', hp: 'HP', k_bb: 'K-BB%', roster: '選手一覧'
};

const METRIC_INFO: Record<string, { desc: string, calc: string, benchmark: string }> = {
  hits: { desc: '打者がヒットを打った総数。', calc: '単打 + 二塁打 + 三塁打 + 本塁打', benchmark: 'レギュラーで100〜150安打。タイトル争いは160安打以上。' },
  hr: { desc: '打者がホームランを打った総数。', calc: 'フェンスオーバー、またはランニング本塁打。', benchmark: '20本で強打者、30本以上でタイトル争いレベル。' },
  rbi: { desc: '打者の打撃によってチームに入った得点。', calc: '安打、犠牲フライ等による得点の合計', benchmark: '80打点で優秀、100打点でリーグトップクラス。' },
  sb: { desc: '次の塁を陥れた回数。足の速さと走塁技術の指標。', calc: '盗塁成功数', benchmark: '20個で俊足、30個以上で盗塁王争い。' },
  avg: { desc: '打数が安打になる確率。確実性を示す伝統的な指標。', calc: '安打 ÷ 打数', benchmark: '.250が平均的、.280で好打者、.300（3割）で一流。' },
  ops: { desc: '出塁率と長打率を足し合わせた、総合的な攻撃力を示す指標。', calc: '出塁率 + 長打率', benchmark: '.750で平均以上、.800で優秀、.900以上は球界を代表する強打者。' },
  wrc_plus: { desc: '球場の広さや時代背景を補正し、打者が平均の何倍の得点を生み出したかを示す傑出度。', calc: 'リーグ平均を100としたパーセンテージ', benchmark: '100が平均、120で優秀、140以上はMVP級の活躍。' },
  war: { desc: '打撃・走塁・守備・投球を総合評価し、控え選手に比べてチームに何勝分上乗せしたかを示す究極の指標。', calc: '各種指標の積み上げによる総合貢献度', benchmark: '2.0でレギュラー、4.0でオールスター級、6.0以上でMVP級。' },
  era: { desc: '投手が9イニング（1試合）投げた場合に失う自責点の平均。', calc: '(自責点 × 9) ÷ 投球回', benchmark: '3.50で優秀な先発、2.00台でエース、1.00台は歴史的。' },
  so: { desc: '投手が奪った三振の総数。圧倒的な投球能力を示す。', calc: '奪三振数', benchmark: '先発でシーズン100〜150個、200個でタイトル級。' },
  wins: { desc: '投手に記録された勝利数。', calc: 'リードした状態で規定回を投げ終え、勝利した場合等', benchmark: '10勝で一人前の先発、15勝で最多勝争い。' },
  sv: { desc: '僅差のリードを守り切って試合を終わらせた抑え投手の記録。', calc: 'セーブ条件を満たして登板し、リードを守り切る', benchmark: '20Sで優秀な守護神、30S以上でセーブ王争い。' },
  hp: { desc: 'セーブが付かない場面でリードを守った中継ぎ投手の評価指標。', calc: 'ホールド数 + 救援勝利数', benchmark: '20HPで優秀なセットアッパー、30HP以上でタイトル争い。' },
  k_bb: { desc: '奪三振率(K%)から与四球率(BB%)を引いたもの。味方の守備や運に左右されない投手の真の支配力。', calc: '(奪三振 ÷ 打者) - (与四球 ÷ 打者)', benchmark: '15%で優秀、20%以上は球界を代表する圧倒的なエース。' },
  roster: { desc: 'この条件（出身校など）に該当する、現在NPBに所属している現役選手の一覧です。', calc: '一軍出場の有無に関わらず全員を表示します。', benchmark: '同級生を比較しやすいよう「年齢の若い順」に並んでいます。' }
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
          
          const birthDateStr = (p as any).birthday || (p as any).birth_date || ''; 
          const age = calculateAge(birthDateStr);

          return {
            player_id: safeId,
            player_name: p.player_name,
            team_name: p.team_name,
            position: p.position_detail,
            is_pitcher: isP,
            is_qualified: isQualified,
            team_games: teamGameCount,
            draft_year: p.draft_year || '不明',
            birth_date: birthDateStr,
            age: age,
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
    if (sortKey === 'roster') return true; 

    const hasRecord = p.games > 0 || p.pa > 0 || (p.ip !== '0' && p.ip !== '');
    const isPitchKey = ['era', 'so', 'wins', 'sv', 'hp', 'k_bb'].includes(sortKey);
    const isBatKey = ['hits', 'hr', 'rbi', 'sb', 'avg', 'ops', 'wrc_plus'].includes(sortKey);
    if (isPitchKey) return p.is_pitcher && hasRecord;
    if (isBatKey) return !p.is_pitcher && hasRecord;
    return hasRecord;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'roster') {
      const ageA = a.age ?? 999;
      const ageB = b.age ?? 999;
      if (ageA !== ageB) return ageA - ageB; 
      return a.player_name.localeCompare(b.player_name, 'ja');
    }

    if (sortKey === 'era') return a.era - b.era;
    if ((b as any)[sortKey] === (a as any)[sortKey]) return b.war - a.war;
    return (b as any)[sortKey] - (a as any)[sortKey];
  });

  const useSplit = ['avg', 'ops', 'wrc_plus', 'war', 'era', 'k_bb'].includes(sortKey);
  const isAccumulation = ['hits', 'hr', 'rbi', 'sb', 'so', 'wins', 'sv', 'hp', 'war'].includes(sortKey);
  
  const qual = sorted.filter(p => p.is_qualified);
  const unqual = sorted.filter(p => !p.is_qualified);

  const renderCard = (p: RankedPlayer, index: number, applyStyle: boolean) => {
    const isDim = applyStyle && !p.is_qualified;
    const statValue = (p as any)[sortKey];
    
    const paceValue = p.team_games > 0 ? (statValue / p.team_games) * 143 : 0;
    const showPace = isAccumulation && p.team_games > 0 && p.team_games < 143 && sortKey !== 'roster';

    return (
      <Link href={`/player/${p.player_id}`} key={p.player_id} className={`block bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl border group transition-all flex flex-col justify-center ${isDim ? 'opacity-80 hover:opacity-100 bg-slate-50/50' : ''}`}>
        <div className="flex items-center gap-4 md:gap-8">
          
          {sortKey !== 'roster' && (
            <div className={`text-4xl md:text-5xl font-black italic w-12 text-center ${index === 0 && (!applyStyle || p.is_qualified) ? 'text-yellow-400' : 'text-slate-200'}`}>
              {index + 1}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-blue-500 uppercase mb-1">{p.team_name}</p>
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 group-hover:text-blue-600 leading-none">{p.player_name}</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase">{p.position}</span>
              {isDim && sortKey !== 'roster' && <span className="text-[9px] font-black bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100">規定未満</span>}
            </div>
            
            <div className="flex flex-col gap-2 pt-2">
              {sortKey === 'roster' ? (
                // ★修正箇所：「生年月日」と「一軍成績」を横に並べて間に縦線を入れる
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                  <div className="font-bold text-slate-500">
                    生年月日: {p.birth_date || '不明'}
                  </div>
                  <div className="font-bold text-slate-600 border-l border-slate-200 pl-3">
                    2026年 一軍成績: {p.games > 0 ? (p.is_pitcher ? `${p.games}登板 防${p.era !== 99.99 ? p.era.toFixed(2) : '-.--'}` : `${p.games}試合 ${p.hits}安打 ${p.hr}本塁打`) : '出場なし'}
                  </div>
                </div>
              ) : (
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
                    <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded italic font-black">WAR {p.war > 0 ? `+${Math.round(p.war * 100) / 100}` : Math.round(p.war * 100) / 100}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-right border-l pl-6 min-w-[110px] flex flex-col justify-center gap-3">
            {sortKey === 'roster' ? (
              <>
                <div>
                  <p className="text-[10px] font-black text-slate-400 mb-0.5">年齢</p>
                  <div className="text-xl md:text-2xl font-black text-slate-900 leading-none">
                    {p.age !== null ? `${p.age}歳` : '-'}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 mb-0.5">ドラフト指名年</p>
                  <div className="text-xl md:text-2xl font-black text-slate-900 leading-none">
                    {p.draft_year}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{SORT_OPTIONS[sortKey]}</p>
                  <div className="text-3xl md:text-4xl font-black italic text-slate-900 leading-none">
                    {sortKey === 'avg' ? `.${String(p.avg.toFixed(3)).split('.')[1]}` : 
                     sortKey === 'era' ? (p.era > 90 ? '-.--' : p.era.toFixed(2)) : 
                     sortKey === 'k_bb' ? `${p.k_bb.toFixed(1)}%` : 
                     sortKey === 'war' ? (p.war > 0 ? `+${Math.round(p.war * 100) / 100}` : Math.round(p.war * 100) / 100) :
                     Math.round(statValue * 100) / 100}
                  </div>
                </div>
                {showPace && (
                  <p className="text-sm md:text-base font-black text-slate-400 mt-1">
                    {sortKey === 'war' 
                      ? `(${paceValue > 0 ? '+' : ''}${paceValue.toFixed(1)} ペース)`
                      : `(${Math.round(paceValue)} ペース)`}
                  </p>
                )}
              </>
            )}
          </div>

        </div>
      </Link>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-900 font-sans tracking-tight">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-8 inline-flex items-center gap-1 text-sm">← TOP</Link>
        <header className="mb-8 text-center">
          <h1 className="text-5xl md:text-7xl font-black italic mb-6">{name} <span className="text-blue-600">Stats</span></h1>
          <div className="flex flex-wrap justify-center gap-2 pt-6 border-t">
            {Object.entries(SORT_OPTIONS).map(([key, label]) => (
              <button key={key} onClick={() => setSortKey(key)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${sortKey === key ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
        </header>

        <div className="mb-8 bg-blue-50 border border-blue-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-lg font-black text-blue-900 mb-2">{SORT_OPTIONS[sortKey]} とは？</h3>
          <p className="text-sm text-slate-700 mb-3">{METRIC_INFO[sortKey].desc}</p>
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-2">
              <span className="bg-white border text-slate-400 px-2 py-0.5 rounded">計算</span>
              <span>{METRIC_INFO[sortKey].calc}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-white border text-slate-400 px-2 py-0.5 rounded">目安</span>
              <span>{METRIC_INFO[sortKey].benchmark}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center font-black animate-pulse text-blue-600 text-2xl italic tracking-tighter uppercase">Fetching...</div>
          ) : sorted.length > 0 ? (
            useSplit && sortKey !== 'roster' ? (
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
            <div className="p-20 text-center text-slate-300 font-black italic uppercase">No Data Found</div>
          )}
        </div>
      </div>
    </main>
  );
}