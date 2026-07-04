'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

// ==========================================
// ユーティリティ関数・各種スタッツ定数
// ==========================================
const toF = (val: any): number => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

const POSITION_ADJUSTMENT: Record<string, number> = {
  '捕手': 12.5, '遊撃手': 7.5, '二塁手': 2.5, '三塁手': 2.5, '中堅手': 2.5,
  '右翼手': -2.5, '左翼手': -2.5, '外野手': -0.8, '内野手': 0, '一塁手': -12.5, '指名打者': -17.5,
};

const PARK_FACTORS: Record<string, number> = {
  '東京ヤクルト': 1.18, 'ヤクルト': 1.18,
  '北海道日本ハム': 1.15, '日本ハム': 1.15,
  '横浜DeNA': 1.13, 'DeNA': 1.13,
  '千葉ロッテ': 1.05, 'ロッテ': 1.05,
  '広島東洋': 1.04, '広島': 1.04,
  '福岡ソフトバンク': 1.01, 'ソフトバンク': 1.01,
  '埼玉西武': 0.97, '西武': 0.97,
  '読売': 0.95, '巨人': 0.95,
  'オリックス': 0.95,
  '東北楽天': 0.91, '楽天': 0.91,
  '阪神': 0.86,
  '中日': 0.84,
  'オイシックス': 1.00, 'くふうハヤテ': 1.00, 'ハヤテ': 1.00
};

const getRank = (value: number, type: 'FIP' | 'wRC+' | 'WAR') => {
  if (type === 'FIP') {
    if (value < 2.10) return 'SSS'; if (value < 2.60) return 'SS'; if (value < 3.10) return 'S'; if (value < 3.70) return 'A'; return 'B';
  } else if (type === 'wRC+') {
    if (value > 175) return 'SSS'; if (value > 155) return 'SS'; if (value > 135) return 'S'; if (value > 115) return 'A'; return 'B';
  } else if (type === 'WAR') {
    if (value > 6.0) return 'SSS'; if (value > 4.5) return 'SS'; if (value > 3.0) return 'S'; if (value > 1.5) return 'A'; return 'B';
  }
  return 'B';
};

const rankBadge = (rank: string) => {
  const base = "px-3 py-1 rounded-lg font-black text-white flex items-center justify-center italic shadow-sm";
  if (rank === 'SSS') return `${base} bg-gradient-to-b from-yellow-300 via-orange-500 to-red-600 animate-bounce`;
  if (rank === 'SS') return `${base} bg-slate-400`;
  if (rank === 'S') return `${base} bg-amber-500`;
  if (rank === 'A') return `${base} bg-blue-500`;
  return `${base} bg-gray-500`;
};

const getGeneration = (birthDateStr: string | undefined | null) => {
  if (!birthDateStr) return null;
  const match = String(birthDateStr).match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 4 || (month === 4 && day === 1)) {
    return year - 1;
  }
  return year;
};

// ==========================================
// 💴 インライン統合用：金額フォーマット関数
// ==========================================
const formatSalaryLabel = (value: number): string => {
  if (value >= 100000000) {
    const oku = Math.floor(value / 100000000);
    const man = Math.floor((value % 100000000) / 10000);
    return man > 0 ? `${oku}億${man}万円` : `${oku}億円`;
  }
  return `${Math.floor(value / 10000)}万円`;
};

const formatYAxisSalary = (value: any): string => {
  const numValue = Number(value);
  if (isNaN(numValue)) return String(value);
  if (numValue >= 100000000) return `${numValue / 100000000}億円`;
  return `${numValue / 10000}万`;
};

const SalaryCustomTooltip = ({ active, payload }: any): React.ReactElement | null => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 shadow-lg rounded-lg border border-slate-100 z-50 text-xs font-sans text-slate-800">
        <p className="font-bold mb-1">📅 {data.year}年度</p>
        <p className="mb-1"><span className="font-medium text-slate-400">所属:</span> {data.team_name}</p>
        <p className="text-blue-600 font-bold text-sm"><span className="font-medium text-slate-400 text-xs">推定:</span> {formatSalaryLabel(data.salary)}</p>
      </div>
    );
  }
  return null;
};

// ==========================================
// メメイン・コンポーネント
// ==========================================
export default function PlayerDetail() {
  const { id } = useParams();
  const [player, setPlayer] = useState<any>(null);
  const [mergedStats, setMergedStats] = useState<any[]>([]);
  const [lgStats, setLgStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  
  const [expandedB, setExpandedB] = useState<number | null>(0);
  const [expandedP, setExpandedP] = useState<number | null>(0);
  
  const [leagueType, setLeagueType] = useState<'1軍' | '2軍'>('1軍');
  
  // タイムラインデータを管理するステート
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);

  const dotFormat = (val: any) => {
    const s = toF(val).toFixed(3);
    return s.startsWith('0.') ? s.substring(1) : s.startsWith('-0.') ? '-' + s.substring(2) : s;
  };

  const formatIP = (ipStr: any) => {
    const s = String(ipStr);
    if (!s.includes('.')) return toF(s);
    const [int, frac] = s.split('.').map(Number);
    return int + (frac === 1 ? 0.333 : frac === 2 ? 0.666 : 0);
  };

  const calcBattingTotals = (stats: any[]) => {
    let g=0, pa=0, ab=0, h=0, h2=0, h3=0, hr=0, rbi=0, bb=0, hbp=0, so=0;
    stats.forEach(s => {
      const b = s.b;
      g += toF(b.試合); pa += toF(b.打席); ab += toF(b.打数);
      h += toF(b.安打); h2 += toF(b.二塁打); h3 += toF(b.三塁打);
      hr += toF(b.本塁打); rbi += toF(b.打点); 
      bb += toF(b.四球); hbp += toF(b.死球); so += toF(b.三振);
    });
    const avg = ab > 0 ? (h / ab) : 0;
    const obp = pa > 0 ? ((h + bb + hbp) / pa) : 0;
    const tb = (h - h2 - h3 - hr) + (h2 * 2) + (h3 * 3) + (hr * 4);
    const slg = ab > 0 ? (tb / ab) : 0;
    const ops = obp + slg;
    return { 試合: g, 安打: h, 本塁打: hr, 打点: rbi, 打率: dotFormat(avg), OPS: dotFormat(ops) };
  };

  const calcPitchingTotals = (stats: any[]) => {
    let g=0, w=0, l=0, sv=0, hp=0, ip=0, h=0, bb=0, so=0, er=0;
    stats.forEach(s => {
      const p = s.p;
      g += toF(p.登板); w += toF(p.勝利); l += toF(p.敗北);
      sv += toF(p.セーブ); hp += toF(p.ホールドポイント || p.HP);
      ip += formatIP(p.投球回); h += toF(p.被安打 || p.安打);
      bb += toF(p.与四球 || p.四球); so += toF(p.三振 || p.奪三振); er += toF(p.自責点);
    });
    const era = ip > 0 ? (er * 9 / ip) : 0;
    const totalOuts = Math.round(ip * 3);
    const displayIpInt = Math.floor(totalOuts / 3);
    const displayIpFrac = totalOuts % 3;
    const displayIp = displayIpFrac === 0 ? displayIpInt.toString() : `${displayIpInt}.${displayIpFrac}`;
    return { 登板: g, 勝利: w, 敗北: l, セーブ: sv, HP: hp, 投球回: displayIp, 奪三振: so, 防御率: era.toFixed(2) };
  };

  const calcSaber = (row: any, type: 'P' | 'B') => {
    const yearData = lgStats[`${row.年度}_${row.level}`];
    if (!yearData) return { fip: '-', war: '0.0', woba: 0, wrcPlus: 0, iso: 0, wrcPlusVal: 0, warVal: 0, ops: 0 };
    if (type === 'P') {
      const stat = row.p;
      const ip = formatIP(stat.投球回);
      if (ip === 0) return { fip: '-', war: '0.0', fipVal: 0, warVal: 0 };
      const fipVal = (13 * toF(stat.本塁打) + 3 * (toF(stat.四球) + toF(stat.死球)) - 2 * toF(stat.三振 || stat.奪三振)) / ip + yearData.lgFIP_C;
      const warVal = ((yearData.lgERA - fipVal) / 10 + 0.12) * (ip / 9);
      return { fip: fipVal.toFixed(2), war: warVal.toFixed(1), fipVal, warVal };
    } else {
      const stat = row.b;
      const pa = toF(stat.打席);
      if (pa === 0) return { woba: 0, wrcPlus: 0, war: '0.0', iso: 0, wrcPlusVal: 0, warVal: 0, ops: 0 };
      const wobaVal = (0.7 * toF(stat.四球) + 0.72 * toF(stat.死球) + 0.9 * (toF(stat.安打)-(toF(stat.二塁打)+toF(stat.三塁打)+toF(stat.本塁打))) + 1.25 * toF(stat.二塁打) + 1.6 * toF(stat.三塁打) + 2.0 * toF(stat.本塁打)) / pa;
      let teamName = row.所属球団 || player?.team_name || '';
      teamName = teamName.replace('タイガース', '').replace('ジャイアンツ', '').replace('ベイスターズ', '').replace('ドラゴンズ', '').replace('スワローズ', '').replace('カープ', '').replace('ゴールデンイーグルス', '').replace('マリーンズ', '').replace('ファイターズ', '').replace('ライオンズ', '').replace('バファローズ', '').replace('ホークス', '');
      const basePF = PARK_FACTORS[teamName] || 1.00;
      const adjPF = (basePF + 1.0) / 2.0;
      const wrcPlusVal = Math.round(((((wobaVal - yearData.lgwOBA) / 1.24 + yearData.lgR_PA) + (yearData.lgR_PA - (adjPF * yearData.lgR_PA))) / yearData.lgR_PA) * 100);
      const battingRuns = ((wobaVal - yearData.lgwOBA) / 1.24) * pa;
      const parkCorrectedRuns = battingRuns + (yearData.lgR_PA - (adjPF * yearData.lgR_PA)) * pa;
      const warVal = (parkCorrectedRuns + (POSITION_ADJUSTMENT[player?.position_detail] || 0) * (pa / 600) + (17.5 * pa / 600)) / 10;
      const opsVal = stat.OPS ? toF(stat.OPS) : (toF(stat.出塁率) + toF(stat.長打率));
      return { woba: wobaVal, wrcPlus: wrcPlusVal, war: warVal.toFixed(1), iso: toF(stat.長打率)-toF(stat.打率), wrcPlusVal, warVal, ops: opsVal };
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const safeId = String(id).padStart(8, '0');

        let pData = null;
        const { data: p1 } = await supabase.from('players').select('*').eq('player_id', safeId).single();
        if (p1) {
          pData = p1;
        } else {
          const { data: p2 } = await supabase.from('farm_players').select('*').eq('player_id', safeId).single();
          if (p2) pData = p2;
        }

        if (!pData) { setLoading(false); return; }
        setPlayer(pData);

        const nameNoSpace = pData.player_name.replace(/\s+/g, '').split('').join('%');
        
        // player_salariesからの年俸履歴取得
        const [allP1, allB1, allP2, allB2, salariesRes] = await Promise.all([
          supabase.from('pitching_stats').select('*').or(`player_id.eq.${safeId},名前.ilike.%${nameNoSpace}%`),
          supabase.from('batting_stats').select('*').or(`player_id.eq.${safeId},名前.ilike.%${nameNoSpace}%`),
          supabase.from('farm_pitching_stats').select('*').or(`player_id.eq.${safeId},名前.ilike.%${nameNoSpace}%`),
          supabase.from('farm_batting_stats').select('*').or(`player_id.eq.${safeId},名前.ilike.%${nameNoSpace}%`),
          supabase.from('player_salaries').select('year, salary, team_name').eq('player_id', safeId).order('year', { ascending: true })
        ]);

        if (salariesRes.data) {
          setSalaryHistory(salariesRes.data);
        }

        const statsMap = new Map();
        const processStats = (data: any[] | null, isPitching: boolean, level: number) => {
          (data || []).forEach((stat: any) => {
            const year = Number(stat.年度);
            const teamName = stat.所属球団 || pData.team_name;
            const key = `${year}_${level}_${teamName}`;
            const existing = statsMap.get(key) || { 
              年度: year, level, 所属球団: teamName, hasBatting: false, hasPitching: false, b: {}, p: {} 
            };
            if (isPitching) {
              existing.hasPitching = true;
              existing.p = stat;
            } else {
              existing.hasBatting = true;
              existing.b = stat;
            }
            statsMap.set(key, existing);
          });                                      
        };

        processStats(allB1.data || [], false, 1);
        processStats(allP1.data || [], true, 1);
        processStats(allB2.data || [], false, 2);
        processStats(allP2.data || [], true, 2);

        const mergedArray = Array.from(statsMap.values());
        const merged = mergedArray.sort((a: any, b: any) => {
          const yearA = Number(a.年度); const yearB = Number(b.年度);
          if (yearB !== yearA) return yearB - yearA;
          if (a.level !== b.level) return a.level - b.level;
          const teamsPrev = mergedArray.filter((s: any) => Number(s.年度) === yearA - 1).map((s: any) => s.所属球団);
          const teamsNext = mergedArray.filter((s: any) => Number(s.年度) === yearA + 1).map((s: any) => s.所属球団);
          if (teamsPrev.includes(a.所属球団) && !teamsPrev.includes(b.所属球団)) return 1;
          if (teamsPrev.includes(b.所属球団) && !teamsPrev.includes(a.所属球団)) return -1;
          if (teamsNext.includes(a.所属球団) && !teamsNext.includes(b.所属球団)) return -1;
          if (teamsNext.includes(b.所属球団) && !teamsNext.includes(a.所属球団)) return 1;
          const clean = (str: string) => (str || '').replace(/\s+/g, '');
          const currentTeam = clean(pData?.team_name || '');
          const teamA = clean(a.所属球団); const teamB = clean(b.所属球団);
          const isA_Current = currentTeam.includes(teamA) || teamA.includes(currentTeam);
          const isB_Current = currentTeam.includes(teamB) || teamB.includes(currentTeam);
          if (isA_Current && !isB_Current) return -1;
          if (isB_Current && !isA_Current) return 1;
          return 0;
        });
        
        setMergedStats(merged);

        if (!merged.some((s: any) => s.level === 1) && merged.some((s: any) => s.level === 2)) {
          setLeagueType('2軍');
        }

        const yearsNum1 = merged.filter((s: any) => s.level === 1).map((s: any) => Number(s.年度));
        const yearsNum2 = merged.filter((s: any) => s.level === 2).map((s: any) => Number(s.年度));

        const queries = [];
        if (yearsNum1.length > 0) {
          queries.push(supabase.from('batting_stats').select('*').in('年度', yearsNum1));
          queries.push(supabase.from('pitching_stats').select('*').in('年度', yearsNum1));
        } else {
          queries.push(Promise.resolve({data: []}), Promise.resolve({data: []}));
        }
        if (yearsNum2.length > 0) {
          queries.push(supabase.from('farm_batting_stats').select('*').in('年度', yearsNum2));
          queries.push(supabase.from('farm_pitching_stats').select('*').in('年度', yearsNum2));
        } else {
          queries.push(Promise.resolve({data: []}), Promise.resolve({data: []}));
        }

        const [resB1, resP1, resB2, resP2] = await Promise.all(queries);
        const statsByKey: Record<string, any> = {};
        const calcLg = (years: number[], lgB: any, lgP: any, level: number) => {
          years.forEach(year => {
            const yearB = lgB?.filter((r: any) => Number(r.年度) === year) || [];
            const yearP = lgP?.filter((r: any) => Number(r.年度) === year) || [];
            const sumPA = yearB.reduce((acc: number, r: any) => acc + toF(r.打席), 0) || 1;
            const sumIP = yearP.reduce((acc: number, r: any) => acc + formatIP(r.投球回), 0) || 1;
            const sumER = yearP.reduce((acc: number, r: any) => acc + toF(r.自責点), 0);
            statsByKey[`${year}_${level}`] = { 
              lgwOBA: (0.7 * yearB.reduce((acc: number, r: any) => acc + toF(r.四球), 0) + 0.72 * yearB.reduce((acc: number, r: any) => acc + toF(r.死球), 0) + 0.9 * (yearB.reduce((acc: number, r: any) => acc + toF(r.安打), 0) - yearB.reduce((acc: number, r: any) => acc + (toF(r.二塁打)+toF(r.三塁打)+toF(r.本塁打)), 0)) + 1.25 * yearB.reduce((acc: number, r: any) => acc + toF(r.二塁打), 0) + 1.6 * yearB.reduce((acc: number, r: any) => acc + toF(r.三塁打), 0) + 2.0 * yearB.reduce((acc: number, r: any) => acc + toF(r.本塁打), 0)) / sumPA, 
              lgFIP_C: (sumER * 9 / sumIP) - (13 * yearP.reduce((acc: number, r: any) => acc + toF(r.本塁打), 0) + 3 * (yearP.reduce((acc: number, r: any) => acc + toF(r.四球), 0) + yearP.reduce((acc: number, r: any) => acc + toF(r.死球), 0)) - 2 * yearP.reduce((acc: number, r: any) => acc + toF(r.三振), 0)) / sumIP, 
              lgR_PA: yearB.reduce((acc: number, r: any) => acc + toF(r.得点), 0) / sumPA, 
              lgERA: (sumER * 9 / sumIP)
            };
          });
        };
        calcLg([...new Set(yearsNum1)], resB1?.data || [], resP1?.data || [], 1);
        calcLg([...new Set(yearsNum2)], resB2?.data || [], resP2?.data || [], 2);
        setLgStats(statsByKey);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    fetchData();
  }, [id]);

  const HelpIcon = ({ id, text, benchmark }: { id: string, text: string, benchmark?: string }) => (
    <span className="relative inline-block ml-1 group">
      <button onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === id ? null : id); }} className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-blue-200 text-slate-500 hover:text-blue-700 text-[9px] flex items-center justify-center font-bold transition-colors">i</button>
      {activeTooltip === id && (
        <div className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-slate-800 text-white text-[10px] rounded-xl shadow-xl text-left leading-relaxed">
          <p className="mb-1">{text}</p>
          {benchmark && (
            <div className="mt-2 pt-2 border-t border-slate-600 flex gap-1.5">
              <span className="bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider whitespace-nowrap h-fit">目安</span>
              <span className="text-slate-300 text-[9px] leading-tight">{benchmark}</span>
            </div>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
        </div>
      )}
    </span>
  );

  if (loading) return <div className="p-10 text-blue-600 bg-white min-h-screen font-black flex items-center justify-center animate-bounce text-2xl">データ読み込み中...</div>;
  if (!player) return <div className="p-10 text-center font-black text-slate-400 mt-20">選手が見つかりません</div>;

  const currentStats = mergedStats.filter((s: any) => s.level === (leagueType === '1軍' ? 1 : 2));
  const teamInitial = player.team_name.includes('阪神') ? 'T' : player.team_name.includes('中日') ? 'D' : 'P';
  const latest = currentStats[0] || {};
  const latestB = latest.b || {};
  const latestP = latest.p || {};
  const bSaber = latest.hasBatting ? calcSaber(latest, 'B') : ({} as any);
  const pSaber = latest.hasPitching ? calcSaber(latest, 'P') : ({} as any);
  const totalWar = player.position_detail === '投手' ? toF(pSaber.warVal) : toF(bSaber.warVal);
  const totalRank = player.position_detail === '投手' ? getRank(toF(pSaber.warVal), 'WAR') : getRank(toF(bSaber.warVal), 'WAR');
  const isPitcher = player.position_detail === '投手';
  const predictedHR = !isPitcher && toF(latestB.試合) > 0 ? Math.round((toF(latestB.本塁打) / toF(latestB.試合)) * 143) : 0;
  
  const chartData = [...currentStats].reverse().map((r: any, i: number) => {
    const isThisYear = i === currentStats.length - 1;
    const yearLabel = `${r.年度}`;
    if (isPitcher) {
      const era = toF(r.p.防御率);
      return { 年度: yearLabel, 奪三振: toF(r.p.三振 || r.p.奪三振), 防御率: era > 90 ? null : era, isPrediction: isThisYear };
    } else {
      return { 年度: yearLabel, 本塁打: isThisYear ? predictedHR : toF(r.b.本塁打), OPS: toF(r.b.出塁率)+toF(r.b.長打率) || toF(r.b.OPS), isPrediction: isThisYear };
    }
  });

  const birthDateStr = player.birthday || player.birth_date;
  const generationYear = getGeneration(birthDateStr);
  const bodyInfo = player.height && player.weight ? `${player.height}cm ／ ${player.weight}kg` : '－';

  const draftInfoNode = player.draft_year && player.draft_rank ? (
    <span className="text-sm font-black text-slate-700">
      <Link href={`/roots/draft/${player.draft_year}`} className="text-blue-600 hover:underline">{player.draft_year}年</Link>
      {' '}{player.is_developmental ? '育成' : 'ドラフト'}{player.draft_rank}位
    </span>
  ) : <span className="text-sm font-black text-slate-700">－</span>;

  const renderCareerInfo = () => {
    const items = [];
    if (player.high_school) items.push(<Link key="hs" href={`/roots/high_school/${encodeURIComponent(player.high_school)}`} className="text-blue-600 hover:underline">{player.high_school}</Link>);
    if (player.university) items.push(<Link key="uni" href={`/roots/university/${encodeURIComponent(player.university)}`} className="text-blue-600 hover:underline">{player.university}</Link>);
    if (player.prev_team_1) items.push(<Link key="prev1" href={`/roots/previous_team/${encodeURIComponent(player.prev_team_1)}`} className="text-blue-600 hover:underline">{player.prev_team_1}</Link>);
    if (player.prev_team_2) items.push(<Link key="prev2" href={`/roots/previous_team/${encodeURIComponent(player.prev_team_2)}`} className="text-blue-600 hover:underline">{player.prev_team_2}</Link>);
    if (player.prev_team_3) items.push(<Link key="prev3" href={`/roots/previous_team/${encodeURIComponent(player.prev_team_3)}`} className="text-blue-600 hover:underline">{player.prev_team_3}</Link>);
    if (items.length === 0) return <span className="text-sm font-black text-slate-700">－</span>;
    return (
      <span className="text-sm font-black text-slate-700 flex flex-wrap gap-x-1">
        {items.map((item: any, i: number) => (
          <span key={i} className="flex items-center">
            {item}
            {i < items.length - 1 && <span className="mx-1 text-slate-300">－</span>}
          </span>
        ))}
      </span>
    );
  };

  const renderBattingAccordion = () => {
    const bStats = currentStats.filter((s: any) => s.hasBatting);
    const bTotals = calcBattingTotals(bStats);
    return (
      <div key="batting" className="mb-12">
        <div className="flex justify-between items-center mb-4 px-2">
          <h2 className="text-xl font-black italic border-l-8 border-green-600 pl-4 text-slate-900 uppercase tracking-tight">Batting Data</h2>
        </div>
        <div className="flex flex-col gap-3">
          {bStats.map((row: any, i: number) => {
            const s = calcSaber(row, 'B') as any; const isOpen = expandedB === i;
            return (
              <div key={i} className="bg-white border-[3px] border-slate-100 rounded-2xl shadow-sm transition-all relative overflow-visible">
                <button onClick={() => setExpandedB(isOpen ? null : i)} className={`w-full flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer transition-colors ${isOpen ? 'bg-blue-50/50 rounded-t-xl' : 'hover:bg-slate-50 rounded-xl'}`}>
                  <div className="flex items-center gap-3 mb-3 md:mb-0"><span className="font-black text-xl text-slate-800">{row.年度}</span><span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{row.所属球団}</span></div>
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto text-sm font-black text-slate-700">
                    <div className="flex gap-4 md:gap-6 text-[12px] md:text-sm flex-1 justify-around md:justify-end">
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">試合</span><span className="font-bold">{row.b.試合 || 0}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">打率</span><span className="font-bold">{dotFormat(row.b.打率)}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">HR</span><span className="font-bold">{row.b.本塁打 || 0}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">打点</span><span className="font-bold">{row.b.打点 || 0}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">OPS</span><span className="font-bold">{dotFormat(s.ops)}</span></div>
                    </div>
                    <div className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
                  </div>
                </button>
                {isOpen && (
                  <div className="p-4 md:p-6 bg-slate-50 border-t-[3px] border-slate-100 rounded-b-xl">
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-6 gap-x-2 text-center text-xs">
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">打席</div><div className="font-bold text-slate-800 text-sm">{row.b.打席 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">安打</div><div className="font-bold text-slate-800 text-sm">{row.b.安打 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">二塁打</div><div className="font-bold text-slate-800 text-sm">{row.b.二塁打 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">三塁打</div><div className="font-bold text-slate-800 text-sm">{row.b.三塁打 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">盗塁</div><div className="font-bold text-slate-800 text-sm">{row.b.盗塁 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">四球</div><div className="font-bold text-slate-800 text-sm">{row.b.四球 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">死球</div><div className="font-bold text-slate-800 text-sm">{row.b.死球 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">三振</div><div className="font-bold text-slate-800 text-sm">{row.b.三振 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">出塁率</div><div className="font-bold text-slate-800 text-sm">{dotFormat(row.b.出塁率)}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">長打率</div><div className="font-bold text-slate-800 text-sm">{dotFormat(row.b.長打率)}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">wOBA<HelpIcon id={`woba_${i}`} text="1打席あたりにどれだけ得点産出に貢献したかを表す指標" benchmark=".330前後が平均、.400超えで一流打者。"/></div><div className="font-bold text-slate-800 text-sm">{dotFormat(s.woba)}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">ISOp<HelpIcon id={`isop_${i}`} text="長打力（打率を含まない純粋な長打の割合）" benchmark=".150で平均的、.200以上で強打者、.250以上は長距離砲。"/></div><div className="font-bold text-slate-800 text-sm">{dotFormat(s.iso)}</div></div>
                      <div className="bg-white rounded-lg border border-orange-100 py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">wRC+<HelpIcon id={`wrcplus_${i}`} text="球場や時代を補正した打撃の傑出度。" benchmark="100が平均、120で優秀、140以上はMVP級。"/></div><div className="font-black text-orange-600 text-base">{s.wrcPlus}</div></div>
                      <div className="bg-white rounded-lg border border-blue-100 py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">WAR<HelpIcon id={`war_b_${i}`} text="打撃・走塁・守備を総合評価し、控え選手に比べてチームに何勝分上乗せしたか" benchmark="2.0でレギュラー、4.0でオールスター級、6.0以上でMVP級。"/></div><div className="font-black text-blue-600 text-base">{s.war}</div></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {bStats.length > 0 && (
            <div className={`mt-2 bg-gradient-to-r ${leagueType === '1軍' ? 'from-blue-700 to-blue-900' : 'from-green-600 to-green-800'} border-[3px] border-transparent rounded-2xl shadow-lg p-4 md:p-6 text-white relative overflow-hidden`}>
              <div className="absolute top-0 right-0 opacity-10 text-7xl font-black -mt-4 -mr-4 select-none">TOTAL</div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4 border-b md:border-b-0 md:border-r border-white/20 pb-4 md:pb-0 md:pr-6 w-full md:w-auto justify-center md:justify-start">
                  <span className="font-black text-3xl tracking-widest uppercase text-white drop-shadow-md leading-none">Career<br/><span className="text-[11px] tracking-normal text-white/80 block mt-1">通算成績 ({leagueType})</span></span>
                </div>
                <div className="flex items-center justify-center md:justify-end gap-2 md:gap-8 w-full md:w-auto text-sm font-black text-white">
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">試合</span><span className="font-bold text-xl drop-shadow-sm">{bTotals.試合}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">打率</span><span className="font-bold text-xl drop-shadow-sm">{bTotals.打率}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">安打</span><span className="font-bold text-xl drop-shadow-sm text-yellow-300">{bTotals.安打}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">HR</span><span className="font-bold text-xl drop-shadow-sm text-red-300">{bTotals.本塁打}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">打点</span><span className="font-bold text-xl drop-shadow-sm">{bTotals.打点}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">OPS</span><span className="font-bold text-xl drop-shadow-sm">{bTotals.OPS}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPitchingAccordion = () => {
    const pStats = currentStats.filter((s: any) => s.hasPitching);
    const pTotals = calcPitchingTotals(pStats);
    return (
      <div key="pitching" className="mb-12">
        <div className="flex justify-between items-center mb-4 px-2">
          <h2 className="text-xl font-black italic border-l-8 border-blue-600 pl-4 text-slate-900 uppercase tracking-tight">Pitching Data</h2>
        </div>
        <div className="flex flex-col gap-3">
          {pStats.map((row: any, i: number) => {
            const s = calcSaber(row, 'P') as any; const ip = formatIP(row.p.投球回);
            const walks = toF(row.p.与四球 || row.p.四球); const hits = toF(row.p.被安打 || row.p.安打);
            const so = toF(row.p.三振 || row.p.奪三振); const hbp = toF(row.p.死球 || row.p.与死球);
            const batters = toF(row.p.打者) || (ip > 0 ? Math.round(ip * 3 + hits + walks + hbp) : 0);
            const whip = ip > 0 ? ((walks + hits) / ip).toFixed(2) : '-';
            const kbb = walks > 0 ? (so / walks).toFixed(2) : (so > 0 ? '∞' : '-');
            const kbbPct = batters > 0 ? (((so - walks) / batters) * 100).toFixed(1) + '%' : '-';
            const isOpen = expandedP === i;
            return (
              <div key={i} className="bg-white border-[3px] border-slate-100 rounded-2xl shadow-sm transition-all relative overflow-visible">
                <button onClick={() => setExpandedP(isOpen ? null : i)} className={`w-full flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer transition-colors ${isOpen ? 'bg-blue-50/50 rounded-t-xl' : 'hover:bg-slate-50 rounded-xl'}`}>
                  <div className="flex items-center gap-3 mb-3 md:mb-0"><span className="font-black text-xl text-slate-800">{row.年度}</span><span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{row.所属球団}</span></div>
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto text-sm font-black text-slate-700">
                    <div className="flex gap-4 md:gap-6 text-[12px] md:text-sm flex-1 justify-around md:justify-end">
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">登板</span><span className="font-bold">{row.p.登板 || 0}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">防御率</span><span className="font-bold text-red-600">{toF(row.p.防御率).toFixed(2)}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">勝</span><span className="font-bold">{row.p.勝利 || 0}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">回</span><span className="font-bold">{row.p.投球回 || '0'}</span></div>
                      <div className="flex flex-col items-center"><span className="text-[10px] text-slate-400 mb-0.5">奪三振</span><span className="font-bold">{row.p.三振 || row.p.奪三振 || 0}</span></div>
                    </div>
                    <div className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
                  </div>
                </button>
                {isOpen && (
                  <div className="p-4 md:p-6 bg-slate-50 border-t-[3px] border-slate-100 rounded-b-xl">
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-6 gap-x-2 text-center text-xs">
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">先発</div><div className="font-bold text-slate-800 text-sm">{row.p.先発 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">完投</div><div className="font-bold text-slate-800 text-sm">{row.p.完投 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">敗北</div><div className="font-bold text-slate-800 text-sm">{row.p.敗北 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">セーブ</div><div className="font-bold text-slate-800 text-sm">{row.p.セーブ || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">HP</div><div className="font-bold text-slate-800 text-sm">{row.p.ホールドポイント || row.p.HP || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">被安打</div><div className="font-bold text-slate-800 text-sm">{hits}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">被本塁打</div><div className="font-bold text-slate-800 text-sm">{row.p.被本塁打 || row.p.本塁打 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">与四球</div><div className="font-bold text-slate-800 text-sm">{walks}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">失点</div><div className="font-bold text-slate-800 text-sm">{row.p.失点 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1">自責点</div><div className="font-bold text-slate-800 text-sm">{row.p.自責点 || 0}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">K/9<HelpIcon id={`k9_${i}`} text="9イニングあたりの奪三振数" benchmark="7.0で平均的、9.0以上で高い奪三振能力。"/></div><div className="font-bold text-slate-800 text-sm">{(so*9/ip).toFixed(2)}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">BB/9<HelpIcon id={`bb9_${i}`} text="9イニングあたりの与四球数" benchmark="3.0以下で優秀、2.0以下で抜群の制球力。"/></div><div className="font-bold text-slate-800 text-sm">{(walks*9/ip).toFixed(2)}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">WHIP<HelpIcon id={`whip_${i}`} text="1イニングあたりに何人の走者を出したか。" benchmark="1.20未満で優秀、1.00未満で球界を代表するエース。"/></div><div className="font-bold text-slate-800 text-sm">{whip}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">K/BB<HelpIcon id={`kbb_${i}`} text="奪三振と与四球の比率。投手の制球力と支配力を示す" benchmark="3.5以上で優秀、5.0以上は圧倒的な支配力。"/></div><div className="font-bold text-slate-800 text-sm">{kbb}</div></div>
                      <div><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">K-BB%<HelpIcon id={`kbbpct_${i}`} text="全打者に対する (奪三振-与四球) の割合。運に左右されない真の支配力" benchmark="15%で優秀、20%以上は球界を代表する圧倒的なエース。"/></div><div className="font-bold text-slate-800 text-sm">{kbbPct}</div></div>
                      <div className="bg-white rounded-lg border border-orange-100 py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">FIP<HelpIcon id={`fip_p_${i}`} text="被本塁打・与四死球・奪三振のみで評価した、運に左右されない防御率" benchmark="3.50で優秀な先発、2.00台でエース、1.00台は歴史的。"/></div><div className="font-black text-orange-600 text-base">{s.fip}</div></div>
                      <div className="bg-white rounded-lg border border-blue-100 py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1 flex items-center justify-center">WAR<HelpIcon id={`war_p_${i}`} text="投球イニングと失点率から、控え投手に比べてチームに何勝分上乗せしたか" benchmark="2.0でローテ定着、4.0でエース級、6.0以上で沢村賞級。"/></div><div className="font-black text-blue-600 text-base">{s.war}</div></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {pStats.length > 0 && (
            <div className={`mt-2 bg-gradient-to-r ${leagueType === '1軍' ? 'from-blue-700 to-blue-900' : 'from-green-600 to-green-800'} border-[3px] border-transparent rounded-2xl shadow-lg p-4 md:p-6 text-white relative overflow-hidden`}>
              <div className="absolute top-0 right-0 opacity-10 text-7xl font-black -mt-4 -mr-4 select-none">TOTAL</div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4 border-b md:border-b-0 md:border-r border-white/20 pb-4 md:pb-0 md:pr-6 w-full md:w-auto justify-center md:justify-start">
                  <span className="font-black text-3xl tracking-widest uppercase text-white drop-shadow-md leading-none">Career<br/><span className="text-[11px] tracking-normal text-white/80 block mt-1">通算成績 ({leagueType})</span></span>
                </div>
                <div className="flex items-center justify-center md:justify-end gap-2 md:gap-8 w-full md:w-auto text-sm font-black text-white">
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">登板</span><span className="font-bold text-xl drop-shadow-sm">{pTotals.登板}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">防御率</span><span className="font-bold text-xl drop-shadow-sm text-red-300">{pTotals.防御率}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">勝利</span><span className="font-bold text-xl drop-shadow-sm text-yellow-300">{pTotals.勝利}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">投球回</span><span className="font-bold text-xl drop-shadow-sm">{pTotals.投球回}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">奪三振</span><span className="font-bold text-xl drop-shadow-sm">{pTotals.奪三振}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">セーブ</span><span className="font-bold text-xl drop-shadow-sm">{pTotals.セーブ}</span></div>
                  <div className="flex flex-col items-center"><span className="text-[10px] text-white/60 mb-0.5">HP</span><span className="font-bold text-xl drop-shadow-sm">{pTotals.HP}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 p-2 md:p-10 text-slate-900 font-sans tracking-tight" onClick={() => setActiveTooltip(null)}>
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-4 inline-block px-2">← メニューへ戻る</Link>
        
        <header className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border-[6px] border-blue-600 mb-8 p-6 md:p-8 text-black">
          <div className="flex justify-between items-start gap-4 mb-8">
            <div className="flex flex-col flex-1">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-blue-100 flex items-center justify-center overflow-hidden bg-white mb-4 relative">
                <img src={`/images/avatars/${teamInitial}_${player.position_detail === '投手' ? 'pitcher_right' : 'batter_right'}.png`} alt="Avatar" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 right-0 bg-blue-600 text-white font-black italic px-3 py-1 text-2xl rounded-tl-2xl border-t-2 border-l-2 border-white shadow-lg">
                  #{latestP?.背番号 || latestB?.背番号 || '--'}
                </div>
              </div>
              <p className="text-blue-500 font-black text-xs md:text-sm mb-1">{player.team_name}</p>
              <h1 className="text-4xl md:text-5xl font-black text-blue-900 italic tracking-tighter mb-4">{player.player_name}</h1>
              <div className="flex gap-2">
                <span className="bg-yellow-400 text-blue-900 text-[10px] md:text-xs font-black px-3 py-1 rounded-full">{player.position_detail || '不明'}</span>
                <span className="bg-gray-100 text-slate-500 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border">{player.throws_bats || '－'}</span>
              </div>
            </div>
            <div className="flex flex-col items-center w-28 md:w-36 flex-shrink-0">
              <span className="bg-blue-600 text-white text-[10px] md:text-xs font-black px-4 py-1.5 rounded-t-xl w-full text-center uppercase tracking-tighter">総合評価</span>
              <div className="bg-blue-50 w-full flex flex-col items-center justify-center py-4 md:py-6 rounded-b-xl border-2 border-blue-600 shadow-inner">
                <span className="text-6xl md:text-8xl font-black text-orange-600 leading-none drop-shadow-md">{totalRank}</span>
                <p className="text-[9px] font-black text-slate-400 mt-2 uppercase tracking-widest text-center">WAR {toF(totalWar).toFixed(1)}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 text-center">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase">{isPitcher ? 'FIP' : 'wRC+'} <HelpIcon id="h1" text={isPitcher ? "被本塁打・与四死球・奪三振のみで評価した、運に左右されない防御率" : "球場や時代背景を補正し、打者が平均の何倍の得点を生み出したかを示す傑出度。"} benchmark={isPitcher ? "3.50で優秀な先発、2.00台でエース。" : "100が平均、120で優秀、140以上はMVP級の活躍。"}/></span>
              <div className={rankBadge(isPitcher ? getRank(toF(pSaber.fipVal), 'FIP') : getRank(toF(bSaber.wrcPlusVal), 'wRC+'))}>RANK</div>
              <p className="text-slate-900 text-3xl font-black mt-2">{isPitcher ? pSaber.fip : bSaber.wrcPlus}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase">{isPitcher ? '奪三振' : 'OPS'} <HelpIcon id="h2" text={isPitcher ? "投手が奪った三振の総数。圧倒的な投球能力を示す。" : "出塁率と長打率を足し合わせた、総合的な攻撃力を示す指標。"} benchmark={isPitcher ? "先発でシーズン100〜150個、200個でタイトル級。" : ".750で平均以上、.800で優秀、.900以上は球界を代表する強打者。"}/></span>
              <div className={rankBadge('S')}>STATUS</div>
              <p className="text-slate-900 text-3xl font-black mt-2">
                {isPitcher ? (latestP.三振 || latestP.奪三振 || 0) : dotFormat(toF(latestB.出塁率) + toF(latestB.長打率) || toF(latestB.OPS))}
              </p>
            </div>
          </div>
        </header>

        <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-5 bg-blue-600 rounded-full"></div>
            <h3 className="text-lg font-black text-slate-800 tracking-wider uppercase">Profile</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">身長／体重</span>
                <span className="text-sm font-black text-slate-700">{bodyInfo}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">生年月日</span>
                <span className="text-sm font-black text-slate-700 flex items-center flex-wrap gap-2">
                  {birthDateStr || '－'}
                  {generationYear && (
                    <Link href={`/roots/generation/${generationYear}`} className="text-[10px] text-blue-600 hover:underline bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                      {generationYear}年度生まれ一覧
                    </Link>
                  )}
                </span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">出身地</span>
                <span className="text-sm font-black text-slate-700">
                  {player.hometown ? (
                    <Link href={`/roots/hometown/${encodeURIComponent(player.hometown)}`} className="text-blue-600 hover:underline">
                      {player.hometown}
                    </Link>
                  ) : '－'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">ドラフト</span>
                {draftInfoNode}
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">推定年俸</span>
                <span className="text-sm font-black text-slate-700">{player.salary_estimated || '－'}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">血液型</span>
                <span className="text-sm font-black text-slate-700">
                  {player.blood_type 
                    ? (String(player.blood_type).trim().includes('不明') ? '不明' : `${String(player.blood_type).trim()}型`) 
                    : '－'}
                </span>
              </div>
            </div>

            <div className="md:col-span-2 flex items-baseline border-b border-slate-100 pb-2 mt-2">
              <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">経歴</span>
              {renderCareerInfo()}
            </div>
          </div>
        </div>

        {/* 🛠️ 外部コンポーネントを廃止し、100%確実に画面表示させるインライン結合ボード＆グラフエリア */}
        <div className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-sm border border-slate-100 mb-8 space-y-4 text-black">
          
          {/* 🔍 原因究明ボード（直接埋め込み型） */}
          <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-[11px] font-mono leading-relaxed shadow-inner">
            <p className="font-bold text-white mb-1">🔍 データベース直結診断ボード</p>
            <p>・取得レコード総数: <span className="text-yellow-300 font-bold">{salaryHistory?.length ?? 0} 件</span></p>
            <p className="text-slate-400 mt-1">・届いている生データ(JSON):</p>
            <pre className="text-slate-300 bg-black/40 p-2 rounded mt-1 overflow-x-auto max-h-24 scrollbar-none">
              {JSON.stringify(salaryHistory, null, 2)}
            </pre>
          </div>

          <div className="flex items-center justify-between border-b border-slate-50 pb-2">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span>💴</span> 年俸推移ヒストリー
            </h3>
            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded">
              単位: 万円 / 億円
            </span>
          </div>

          {(!salaryHistory || salaryHistory.length === 0) ? (
            <div className="text-center py-6 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed">
              現在、この選手の紐付け済み年俸データは0件です。
            </div>
          ) : (
            <div className="w-full overflow-x-auto scrollbar-thin">
              <div className="min-w-[500px] h-[280px] sm:h-[350px] pr-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={[...salaryHistory].sort((a, b) => a.year - b.year)}
                    margin={{ top: 15, right: 10, left: 15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} tickLine={false} dy={8} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatYAxisSalary} tickLine={false} dx={-8} />
                    <ChartTooltip content={(props) => <SalaryCustomTooltip {...props} />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Line type="monotone" dataKey="salary" stroke="#2563eb" strokeWidth={3} activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#2563eb' }} dot={{ r: 4, stroke: '#ffffff', strokeWidth: 1.5, fill: '#2563eb' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* ★ 追加：1軍/2軍の成績表示切り替えタブ */}
        <div className="flex justify-center mb-8">
          <div className="bg-slate-200 p-1 rounded-2xl flex w-full max-w-sm gap-1 shadow-inner border border-slate-300/50">
            <button 
              onClick={() => setLeagueType('1軍')}
              className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${leagueType === '1軍' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:bg-slate-300/50'}`}
            >
              1軍成績
            </button>
            <button 
              onClick={() => setLeagueType('2軍')}
              className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${leagueType === '2軍' ? 'bg-white text-green-600 shadow-md' : 'text-slate-500 hover:bg-slate-300/50'}`}
            >
              2軍成績
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-6 shadow-xl border-4 border-slate-100 mb-8 text-black">
          <h3 className={`font-black text-xs uppercase border-b-2 pb-2 mb-4 ${leagueType === '1軍' ? 'text-blue-600 border-blue-100' : 'text-green-600 border-green-100'}`}>
            {isPitcher ? '奪三振・防御率トレンド' : '本塁打・OPSトレンド'} <span className="text-slate-400 ml-1">{leagueType}</span>
          </h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="年度" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" fontSize={10} axisLine={false} tickLine={false} reversed={isPitcher} />
                <ChartTooltip />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }} />
                {isPitcher ? (
                  <>
                    <Line yAxisId="left" type="monotone" dataKey="奪三振" stroke="#ef4444" strokeWidth={4} dot={{ r: 4 }} name="奪三振" />
                    <Line yAxisId="right" type="monotone" dataKey="防御率" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4 }} name="防御率" />
                  </>
                ) : (
                  <>
                    <Line yAxisId="left" type="monotone" dataKey="本塁打" stroke="#ef4444" strokeWidth={4} dot={{ r: 4 }} name="本塁打" />
                    <Line yAxisId="right" type="monotone" dataKey="OPS" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4 }} name="OPS" />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <section className="mb-20 space-y-8">
          {currentStats.length === 0 ? (
            <div className="bg-white rounded-3xl border-4 border-dashed border-slate-200 p-12 text-center">
              <p className="text-slate-400 font-black italic text-xl">No {leagueType} Data</p>
              <p className="text-slate-400 text-sm mt-2">{leagueType}の成績データはありません</p>
            </div>
          ) : isPitcher ? (
            <>
              {currentStats.some((s: any) => s.hasPitching) && renderPitchingAccordion()}
              {currentStats.some((s: any) => s.hasBatting) && renderBattingAccordion()}
            </>
          ) : (
            <>
              {currentStats.some((s: any) => s.hasBatting) && renderBattingAccordion()}
              {currentStats.some((s: any) => s.hasPitching) && renderPitchingAccordion()}
            </>
          )}
        </section>

      </div>
      <footer className="mt-20 text-center text-gray-400 text-[10px] font-black uppercase pb-12 italic">© 2026 POWERFUL NPB ANALYTICS</footer>
    </main>
  );
}