'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// --- 1. 型定義 ---
type League = 'ALL' | 'Central' | 'Pacific';
type Role = 'hitter' | 'pitcher';
type FilterType = 'qualified' | 'half' | 'all';
type PosFilter = 'all' | 'starter' | 'reliever' | 'catcher' | 'infielder' | 'outfielder';
type BatThrowFilter = 'all' | 'right' | 'left' | 'both';
type ProfFilter = 'all' | 'rookie' | 'u25' | 'tatakiage';

interface PlayerRank {
  player_id: string;
  player_name: string;
  team_name: string;
  short_team: string;
  league: string;
  position: string;
  throws_bats: string;
  age: number | null;
  salary_estimated: string;
  
  // 打撃
  pa?: number; hits?: number; hr?: number; rbi?: number; sb?: number; bb?: number; so_bat?: number;
  avg?: number; ops?: number; woba?: number; isop?: number; wrc_plus?: number; babip?: number; roman?: number; 
  
  // 投手（★ここに bb9?: number; を復活させました！）
  games?: number; starts?: number; ip_str?: string; wins?: number; losses?: number; sv?: number; hp?: number;
  so_pitch?: number; era?: number; whip?: number; k9?: number; bb9?: number; k_bb_pct?: number; fip?: number; babip_pitch?: number; unluck?: number; 
  
  // 共通
  war: number;
  cospa: number;
}

const CENTRAL_TEAMS = ['阪神', '広島', 'DeNA', '巨人', 'ヤクルト', '中日'];
const PACIFIC_TEAMS = ['オリックス', 'ロッテ', 'ソフトバンク', '楽天', '西武', '日本ハム'];

const getTeamInfo = (teamName: string): { league: League | 'Other', shortName: string } => {
  const cleanTeam = String(teamName).replace(/[\s　]+/g, '');
  if (cleanTeam.includes('阪神') || cleanTeam.includes('タイガース')) return { league: 'Central', shortName: '阪神' };
  if (cleanTeam.includes('広島') || cleanTeam.includes('カープ')) return { league: 'Central', shortName: '広島' };
  if (cleanTeam.includes('DeNA') || cleanTeam.includes('ベイスターズ')) return { league: 'Central', shortName: 'DeNA' };
  if (cleanTeam.includes('読売') || cleanTeam.includes('巨人') || cleanTeam.includes('ジャイアンツ')) return { league: 'Central', shortName: '巨人' };
  if (cleanTeam.includes('ヤクルト') || cleanTeam.includes('スワローズ')) return { league: 'Central', shortName: 'ヤクルト' };
  if (cleanTeam.includes('中日') || cleanTeam.includes('ドラゴンズ')) return { league: 'Central', shortName: '中日' };
  
  if (cleanTeam.includes('オリックス') || cleanTeam.includes('バファローズ')) return { league: 'Pacific', shortName: 'オリックス' };
  if (cleanTeam.includes('ロッテ') || cleanTeam.includes('マリーンズ')) return { league: 'Pacific', shortName: 'ロッテ' };
  if (cleanTeam.includes('ソフトバンク') || cleanTeam.includes('ホークス')) return { league: 'Pacific', shortName: 'ソフトバンク' };
  if (cleanTeam.includes('楽天') || cleanTeam.includes('イーグルス')) return { league: 'Pacific', shortName: '楽天' };
  if (cleanTeam.includes('西武') || cleanTeam.includes('ライオンズ')) return { league: 'Pacific', shortName: '西武' };
  if (cleanTeam.includes('日本ハム') || cleanTeam.includes('ファイターズ')) return { league: 'Pacific', shortName: '日本ハム' };
  
  return { league: 'Other', shortName: 'Other' };
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

const calculateAge = (birthDateStr: any) => {
  if (!birthDateStr) return null;
  const match = String(birthDateStr).match(/(\d{4})/);
  if (!match) return null;
  return 2026 - parseInt(match[1], 10);
};

const METRIC_INFO: Record<string, { desc: string, calc: string, benchmark: string }> = {
  war: { desc: '打撃・走塁・守備・投球を総合評価し、控え選手に比べてチームに何勝分上乗せしたかを示す指標。', calc: '当サイト独自の簡易算出（※本来必要なパークファクターや詳細な守備指標を簡略化し、基礎スタッツから推計した代替値を使用しています）', benchmark: '2.0でレギュラー定着、4.0でオールスター級、6.0以上でMVP級。' },
  avg: { desc: '打数が安打になる確率。確実性を示す伝統的な指標。', calc: '安打 ÷ 打数', benchmark: '.250が平均的、.280で好打者、.300（3割）で一流。' },
  hr: { desc: '打者がホームランを打った総数。', calc: 'フェンスオーバー、またはランニング本塁打。', benchmark: '20本で強打者、30本以上でタイトル争いレベル。' },
  hits: { desc: '打者がヒットを打った総数。', calc: '単打 + 二塁打 + 三塁打 + 本塁打', benchmark: 'レギュラーで100〜150安打。タイトル争いは160安打以上。' },
  rbi: { desc: '打者の打撃によってチームに入った得点。', calc: '安打、犠牲フライ等による得点の合計', benchmark: '80打点で優秀、100打点でリーグトップクラス。' },
  ops: { desc: '出塁率と長打率を足し合わせた、総合的な攻撃力を示す指標。', calc: '出塁率 + 長打率', benchmark: '.750で平均以上、.800で優秀、.900以上は球界を代表する強打者。' },
  wrc_plus: { desc: '打者が平均の何倍の得点を生み出したかを示す傑出度。', calc: '当サイト独自の簡易算出（※本来必要なパークファクター補正等を省略し、リーグ平均をベースに算出した簡易版を使用しています）', benchmark: '100が平均、120で優秀、140以上はMVP級の活躍。' },
  woba: { desc: '1打席あたりにどれだけ得点産出に貢献したかを表す指標。', calc: '各種イベントに得点価値の重みを掛けて算出（※当サイト独自の固定係数を用いて簡易算出しています）', benchmark: '.330前後が平均、.400超えで一流打者。' },
  isop: { desc: '打率を含まない純粋な長打の割合。長打力を示す。', calc: '長打率 - 打率', benchmark: '.150で平均的、.200以上で強打者、.250以上は長距離砲。' },
  babip: { desc: 'グラウンド内に飛んだ打球がヒットになる確率。長期的には「.300」前後に収束するため、運の要素（上振れ・下振れ）を測る指標となる。', calc: '(安打 - 本塁打) ÷ (打数 - 三振 - 本塁打 + 犠飛)', benchmark: '.300より極端に高ければ上振れ(幸運)、低ければ下振れ(不運)の可能性が高い。' },
  era: { desc: '投手が9イニング（1試合）投げた場合に失う自責点の平均。', calc: '(自責点 × 9) ÷ 投球回', benchmark: '3.50で優秀な先発、2.00台でエース、1.00台は歴史的。' },
  so_pitch: { desc: '投手が奪った三振の総数。圧倒的な投球能力を示す。', calc: '奪三振数', benchmark: '先発でシーズン100〜150個、200個でタイトル級。' },
  wins: { desc: '投手に記録された勝利数。', calc: 'リードした状態で規定回を投げ終え、勝利した場合等', benchmark: '10勝で一人前の先発、15勝で最多勝争い。' },
  sv: { desc: '僅差のリードを守り切って試合を終わらせた抑え投手の記録。', calc: 'セーブ条件を満たして登板し、リードを守り切る', benchmark: '20Sで優秀な守護神、30S以上でセーブ王争い。' },
  hp: { desc: 'セーブが付かない場面でリードを守った中継ぎ投手の評価指標。', calc: 'ホールド数 + 救援勝利数', benchmark: '20HPで優秀なセットアッパー、30HP以上でタイトル争い。' },
  k_bb_pct: { desc: '全打者に対する (奪三振-与四球) の割合。運に左右されない真の支配力。', calc: '((奪三振 - 与四球) ÷ 打者) × 100', benchmark: '15%で優秀、20%以上は球界を代表する圧倒的なエース。' },
  k9: { desc: '9イニング（1試合）あたりに奪う三振の数。', calc: '(奪三振 × 9) ÷ 投球回', benchmark: '7.0で平均的、9.0以上で高い奪三振能力。' },
  bb9: { desc: '9イニング（1試合）あたりに与える四球の数。', calc: '(与四球 × 9) ÷ 投球回', benchmark: '3.0以下で優秀、2.0以下で抜群の制球力。' },
  whip: { desc: '1イニングあたりに何人の走者を出したか。', calc: '(与四球 + 被安打) ÷ 投球回', benchmark: '1.20未満で優秀、1.00未満で球界を代表するエース。' },
  fip: { desc: '被本塁打・与四死球・奪三振のみで評価した、運に左右されない防御率。', calc: '(13×被本塁打 + 3×(与四球+与死球) - 2×奪三振) ÷ 投球回 + リーグ定数（※定数は概算値を使用）', benchmark: '3.50で優秀、2.00台でエース、1.00台は歴史的。' },
  cospa: { desc: '1億円あたりどれだけチームの勝利（WAR）に貢献しているかを示すコストパフォーマンス（年俸貢献度 / ROI：投資利益率）。チーム編成の視点において極めて重要なバリュー指標となります。', calc: 'WAR ÷ (推定年俸 ÷ 1億)', benchmark: '若手や育成出身が上位に来やすく、1.0を超えれば超優良コスパ。' },
  unluck: { desc: '防御率からFIPを引いた値。実際の失点より投球内容が優れている（不運である）度合いを示す。', calc: '防御率 - FIP', benchmark: 'プラスが大きいほど不運（バックの守備難や運の悪さ）、マイナスが大きいほど幸運。' },
  roman: { desc: '打率は低いが、純粋な長打力（ISOp）と四球を選ぶ力に長けた「ロマン砲」度合いを示す当サイト独自指標。', calc: 'ISOp + 四球率 - 打率', benchmark: '数値が高いほど「当たれば飛ぶ＆選球眼が良いが確実性が低い」ロマン溢れる打者。' }
};

const PROF_INFO: Record<string, string> = {
  rookie: '💡 2025年ドラフトで入団した新人選手のみを表示しています',
  u25: '💡 2026年時点で25歳以下の若手選手のみを表示しています',
  tatakiage: '💡 ドラフト5位以下、または育成枠でプロ入りした選手のみを表示しています'
};

// --- 2. メインコンポーネント ---
function Leaderboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const role = (searchParams.get('role') as Role) || 'hitter';
  const league = (searchParams.get('league') as League) || 'ALL';
  const sortKey = searchParams.get('sort') || 'war';
  const teamParam = searchParams.get('team') || 'ALL';
  const filterType = (searchParams.get('filter') as FilterType) || 'qualified';
  const posFilter = (searchParams.get('pos') as PosFilter) || 'all';
  const batThrowFilter = (searchParams.get('bt') as BatThrowFilter) || 'all';
  const profFilter = (searchParams.get('prof') as ProfFilter) || 'all';

  const [players, setPlayers] = useState<PlayerRank[]>([]);
  const [loading, setLoading] = useState(true);

  const HITTER_METRICS = [
    { key: 'war', label: 'WAR' }, { key: 'avg', label: '打率' }, { key: 'hr', label: '本塁打' }, 
    { key: 'hits', label: '安打' }, { key: 'rbi', label: '打点' }, { key: 'ops', label: 'OPS' }, 
    { key: 'wrc_plus', label: 'wRC+' }, { key: 'woba', label: 'wOBA' }, { key: 'isop', label: 'ISOp' },
    { key: 'babip', label: 'BABIP' }, { key: 'roman', label: 'ロマン度' }, { key: 'cospa', label: 'コスパ(WAR/億)' }
  ];
  const PITCHER_METRICS = [
    { key: 'war', label: 'WAR' }, { key: 'era', label: '防御率' }, { key: 'so_pitch', label: '奪三振' }, 
    { key: 'wins', label: '勝利' }, { key: 'sv', label: 'セーブ' }, { key: 'hp', label: 'HP' }, 
    { key: 'k_bb_pct', label: 'K-BB%' }, { key: 'k9', label: 'K/9' }, { key: 'bb9', label: 'BB/9' },
    { key: 'whip', label: 'WHIP' }, { key: 'fip', label: 'FIP' },
    { key: 'babip', label: 'BABIP' }, { key: 'unluck', label: '不運度' }, { key: 'cospa', label: 'コスパ(WAR/億)' }
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
            const t = String(row.所属球団);
            const g = parseInt(row.試合) || 0;
            if (!teamGames[t] || g > teamGames[t]) teamGames[t] = g;
          });
          const maxVals = Object.values(teamGames);
          if(maxVals.length > 0) globalMaxGames = Math.max(...maxVals);
        }

        const processed: PlayerRank[] = [];

        statsData.forEach(s => {
          const stat = s as any;
          const safeId = String(stat.player_id).padStart(8, '0');
          const p = playersData.find(player => String(player.player_id).padStart(8, '0') === safeId);
          const team = String(stat.所属球団 || p?.team_name || '不明');
          
          const pos = String(p?.position_detail || (role === 'hitter' ? '内野手' : '投手'));
          const throwsBats = String(p?.throws_bats || '');

          if (role === 'hitter' && pos.includes('投手')) return;

          if (batThrowFilter !== 'all') {
            if (role === 'hitter') {
              if (batThrowFilter === 'right' && !throwsBats.includes('右打')) return;
              if (batThrowFilter === 'left' && !throwsBats.includes('左打')) return;
              if (batThrowFilter === 'both' && !throwsBats.includes('両打')) return;
            } else {
              if (batThrowFilter === 'right' && !throwsBats.includes('右投')) return;
              if (batThrowFilter === 'left' && !throwsBats.includes('左投')) return;
            }
          }

          if (role === 'hitter') {
            if (posFilter === 'catcher' && !pos.includes('捕手')) return;
            if (posFilter === 'infielder' && !pos.includes('内野手') && !pos.includes('一塁') && !pos.includes('二塁') && !pos.includes('三塁') && !pos.includes('遊撃')) return;
            if (posFilter === 'outfielder' && !pos.includes('外野')) return;
          }

          const age = calculateAge(p?.birth_date || p?.birthday);
          const isRookie = p?.draft_year && String(p.draft_year).includes('2025');
          const draftRankStr = String(p?.draft_rank || '');
          const isTatakiage = p?.is_developmental || (draftRankStr && parseInt(draftRankStr.replace(/[^0-9]/g, '')) >= 5);
          const isU25 = age !== null && age <= 25;

          if (profFilter === 'rookie' && !isRookie) return;
          if (profFilter === 'u25' && !isU25) return;
          if (profFilter === 'tatakiage' && !isTatakiage) return;

          const teamGameCount = teamGames[team] || globalMaxGames;
          const { league: currentLeague, shortName: currentShortTeam } = getTeamInfo(team);

          if (role === 'hitter') {
            const pa = toF(stat.打席);
            if (pa === 0) return;

            const is_qualified = pa >= Math.floor(teamGameCount * 3.1);
            const is_half_qualified = pa >= Math.floor((teamGameCount * 3.1) / 2);

            if (filterType === 'qualified' && !is_qualified) return;
            if (filterType === 'half' && !is_half_qualified) return;

            processed.push({
              player_id: safeId,
              player_name: String(stat.名前 || p?.player_name || '不明'),
              team_name: team, short_team: currentShortTeam, league: currentLeague, position: pos,
              throws_bats: throwsBats, age, salary_estimated: String(p?.salary_estimated || '不明'),
              
              war: toF(stat['野手WAR'] || stat.WAR),
              cospa: toF(stat.cospa),
              roman: toF(stat.roman),
              pa, 
              hits: toF(stat.安打), 
              hr: toF(stat.本塁打), 
              rbi: toF(stat.打点), 
              sb: toF(stat.盗塁),
              bb: toF(stat.四球), 
              so_bat: toF(stat.三振), 
              avg: toF(stat.打率), 
              ops: toF(stat.OPS),
              woba: toF(stat.wOBA), 
              isop: toF(stat.ISOp), 
              wrc_plus: toF(stat['wRC+']),
              babip: toF(stat.BABIP)
            });

          } else {
            const ipStr = String(stat.投球回 || '0');
            const ip = formatIP(ipStr);
            if (ip === 0) return;

            const games = toF(stat.登板);
            const starts = toF(stat.先発);

            if (posFilter === 'starter' && starts < games / 2) return;
            if (posFilter === 'reliever' && starts >= games / 2) return;

            const is_qualified = ip >= teamGameCount;
            const is_half_qualified = ip >= (teamGameCount / 2);

            if (filterType === 'qualified' && !is_qualified) return;
            if (filterType === 'half' && !is_half_qualified) return;

            processed.push({
              player_id: safeId,
              player_name: String(stat.名前 || p?.player_name || '不明'),
              team_name: team, short_team: currentShortTeam, league: currentLeague, position: pos,
              throws_bats: throwsBats, age, salary_estimated: String(p?.salary_estimated || '不明'),
              
              war: toF(stat['投手WAR'] || stat.WAR), 
              cospa: toF(stat.cospa), 
              unluck: toF(stat.unluck),
              games, 
              starts, 
              ip_str: ipStr, 
              wins: toF(stat.勝利), 
              losses: toF(stat.敗北),
              sv: toF(stat.セーブ), 
              hp: toF(stat.ホールドポイント || stat.HP), 
              so_pitch: toF(stat.三振), 
              era: toF(stat.防御率), 
              whip: toF(stat.WHIP),
              k9: toF(stat['K/9']), 
              bb9: toF(stat['BB/9']), // ★ エラーになっていた部分です
              k_bb_pct: toF(stat['K-BB%']), 
              fip: toF(stat.FIP),
              babip_pitch: toF(stat.BABIP)
            });
          }
        });

        const filtered = processed.filter(p => {
          if (league !== 'ALL' && p.league !== league) return false;
          if (teamParam !== 'ALL' && p.short_team !== teamParam) return false;
          return true;
        });

        const sorted = filtered.sort((a, b) => {
          const valA = (a as any)[sortKey === 'babip' && role === 'pitcher' ? 'babip_pitch' : sortKey] ?? -999;
          const valB = (b as any)[sortKey === 'babip' && role === 'pitcher' ? 'babip_pitch' : sortKey] ?? -999;
          if (['era', 'fip', 'whip', 'bb9'].includes(sortKey)) return valA - valB;
          return valB - valA;
        });

        setPlayers(sorted.slice(0, 100)); 
      } catch (err) {
        console.error('Data parsing error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRanking();
  }, [role, league, sortKey, filterType, teamParam, posFilter, batThrowFilter, profFilter]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key === 'role') {
      params.set('sort', 'war'); 
      params.set('pos', 'all'); 
      params.set('bt', 'all');
    }
    if (key === 'league') params.set('team', 'ALL'); 
    router.push(`/ranking?${params.toString()}`);
  };

  const formatMainStat = (key: string, value: number) => {
    if (value === undefined || isNaN(value)) return '-';
    if (['avg', 'woba', 'isop', 'babip'].includes(key)) {
      const s = value.toFixed(3);
      return s.startsWith('0.') ? s.substring(1) : s.startsWith('-0.') ? '-' + s.substring(2) : s;
    }
    if (key === 'ops') return value.toFixed(3);
    if (key === 'k_bb_pct') return `${value.toFixed(1)}%`;
    if (['era', 'whip', 'k9', 'bb9', 'fip', 'unluck', 'roman', 'cospa'].includes(key)) return value > 90 ? '-.--' : value.toFixed(2);
    if (key === 'war') return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
    return Math.round(value);
  };

  const displayTeams = league === 'Central' ? CENTRAL_TEAMS : league === 'Pacific' ? PACIFIC_TEAMS : [...CENTRAL_TEAMS, ...PACIFIC_TEAMS];

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

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar border-b border-slate-100">
            <button onClick={() => updateParam('team', 'ALL')} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${teamParam === 'ALL' ? 'bg-slate-700 text-white shadow-md' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
              全チーム
            </button>
            {displayTeams.map(t => (
              <button key={t} onClick={() => updateParam('team', t)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${teamParam === t ? 'bg-slate-700 text-white shadow-md' : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button onClick={() => updateParam('pos', 'all')} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${posFilter === 'all' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
              全ポジション
            </button>
            {role === 'hitter' ? (
              <>
                <button onClick={() => updateParam('pos', 'catcher')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${posFilter === 'catcher' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>捕手</button>
                <button onClick={() => updateParam('pos', 'infielder')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${posFilter === 'infielder' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>内野手</button>
                <button onClick={() => updateParam('pos', 'outfielder')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${posFilter === 'outfielder' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>外野手</button>
              </>
            ) : (
              <>
                <button onClick={() => updateParam('pos', 'starter')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${posFilter === 'starter' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>先発</button>
                <button onClick={() => updateParam('pos', 'reliever')} className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${posFilter === 'reliever' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>救援</button>
              </>
            )}
          </div>

          <div className="flex gap-2 border-b border-slate-100 pb-4 mb-2">
            <button onClick={() => updateParam('bt', 'all')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border-2 transition-all ${batThrowFilter === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>全投打</button>
            <button onClick={() => updateParam('bt', 'right')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border-2 transition-all ${batThrowFilter === 'right' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>{role === 'hitter' ? '右打' : '右投'}</button>
            <button onClick={() => updateParam('bt', 'left')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border-2 transition-all ${batThrowFilter === 'left' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>{role === 'hitter' ? '左打' : '左投'}</button>
            {role === 'hitter' && <button onClick={() => updateParam('bt', 'both')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border-2 transition-all ${batThrowFilter === 'both' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>両打</button>}
          </div>

          <div className="flex gap-2">
            <button onClick={() => updateParam('prof', 'all')} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${profFilter === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>全経歴</button>
            <button onClick={() => updateParam('prof', 'rookie')} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${profFilter === 'rookie' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>ルーキー</button>
            <button onClick={() => updateParam('prof', 'u25')} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${profFilter === 'u25' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>U-25</button>
            <button onClick={() => updateParam('prof', 'tatakiage')} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${profFilter === 'tatakiage' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>叩き上げ</button>
          </div>

          <div className="flex gap-2 border-b border-slate-100 pb-4 mb-2">
            {(['qualified', 'half', 'all'] as FilterType[]).map(f => (
              <button key={f} onClick={() => updateParam('filter', f)} className={`flex-1 py-2 rounded-lg text-[10px] font-black border-2 transition-all ${filterType === f ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                {f === 'qualified' ? '規定到達' : f === 'half' ? '規定1/2' : 'すべて(規定無視)'}
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

      {profFilter !== 'all' && PROF_INFO[profFilter] && (
        <div className="mb-4 bg-blue-50 border border-blue-100 text-blue-800 text-[11px] font-bold px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm">
          {PROF_INFO[profFilter]}
        </div>
      )}

      {METRIC_INFO[sortKey] && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-400"></div>
          <h3 className="text-lg font-black text-slate-800 mb-2 pl-2">
            {activeMetrics.find(m => m.key === sortKey)?.label} <span className="text-xs font-bold text-slate-400 ml-1">とは？</span>
          </h3>
          <p className="text-sm text-slate-700 mb-4 pl-2 leading-relaxed">{METRIC_INFO[sortKey].desc}</p>
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 text-xs font-medium text-slate-600 pl-2">
            <div className="flex items-center gap-2">
              <span className="bg-white border text-slate-400 px-2 py-0.5 rounded text-[10px] font-black">計算</span>
              <span>{METRIC_INFO[sortKey].calc}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-white border text-slate-400 px-2 py-0.5 rounded text-[10px] font-black">目安</span>
              <span>{METRIC_INFO[sortKey].benchmark}</span>
            </div>
          </div>
        </div>
      )}

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
                    <span className="border-l pl-2">{p.throws_bats}</span>
                    {p.age && <span className="border-l pl-2">{p.age}歳</span>}
                    {sortKey === 'cospa' && <span className="border-l pl-2">{p.salary_estimated}</span>}
                  </div>
                </div>

                <div className="text-right border-l pl-4 min-w-[80px]">
                  <p className="text-[9px] font-black text-slate-300 uppercase mb-1">{activeMetrics.find(m => m.key === sortKey)?.label}</p>
                  <div className="text-2xl font-black italic text-slate-900 leading-none">
                    {formatMainStat(sortKey, sortKey === 'babip' && role === 'pitcher' ? p.babip_pitch : (p as any)[sortKey])}
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
                    <span>{p.games}登板 {p.starts}先発</span>
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