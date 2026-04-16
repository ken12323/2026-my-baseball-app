'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

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
  '中日': 0.84
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

export default function PlayerDetail() {
  const { id } = useParams();
  const [player, setPlayer] = useState<any>(null);
  const [mergedStats, setMergedStats] = useState<any[]>([]);
  const [lgStats, setLgStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  
  // アコーディオンの開閉状態を管理（初期値0で最新年度を開いておく）
  const [expandedB, setExpandedB] = useState<number | null>(0);
  const [expandedP, setExpandedP] = useState<number | null>(0);

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

  const calcSaber = (row: any, type: 'P' | 'B') => {
    const yearData = lgStats[row.年度];
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

        const { data: p } = await supabase.from('players').select('*').eq('player_id', safeId).single();
        if (!p) { setLoading(false); return; }
        setPlayer(p);

        const nameNoSpace = p.player_name.replace(/\s+/g, '').split('').join('%');
        
        const [allP, allB] = await Promise.all([
          supabase.from('pitching_stats').select('*').or(`player_id.eq.${safeId},名前.ilike.%${nameNoSpace}%`),
          supabase.from('batting_stats').select('*').or(`player_id.eq.${safeId},名前.ilike.%${nameNoSpace}%`)
        ]);

        const statsMap = new Map();
        const bData = allB.data || [];
        const pData = allP.data || [];

        bData.forEach(bStat => {
          const year = Number(bStat.年度);
          statsMap.set(year, { 
            年度: year, 
            所属球団: bStat.所属球団 || p.team_name, 
            hasBatting: true, 
            hasPitching: false,
            b: bStat, 
            p: {} 
          });
        });

        pData.forEach(pStat => {
          const year = Number(pStat.年度);
          const existing = statsMap.get(year) || { 年度: year, 所属球団: pStat.所属球団 || p.team_name, hasBatting: false, b: {} };
          statsMap.set(year, { 
            ...existing, 
            hasPitching: true, 
            p: pStat 
          });
        });

        const merged = Array.from(statsMap.values()).sort((a, b) => b.年度 - a.年度);
        setMergedStats(merged);

        const yearsNum = merged.map(s => Number(s.年度));
        const [{ data: lgB }, { data: lgP }] = await Promise.all([
          supabase.from('batting_stats').select('*').in('年度', yearsNum),
          supabase.from('pitching_stats').select('*').in('年度', yearsNum)
        ]);

        const statsByYear: Record<string, any> = {};
        yearsNum.forEach(year => {
          const yearB = lgB?.filter(r => Number(r.年度) === year) || [];
          const yearP = lgP?.filter(r => Number(r.年度) === year) || [];
          const sumPA = yearB.reduce((acc, r) => acc + toF(r.打席), 0) || 1;
          const sumIP = yearP.reduce((acc, r) => acc + formatIP(r.投球回), 0) || 1;
          const sumER = yearP.reduce((acc, r) => acc + toF(r.自責点), 0);
          statsByYear[String(year)] = { 
            lgwOBA: (0.7 * yearB.reduce((acc, r) => acc + toF(r.四球), 0) + 0.72 * yearB.reduce((acc, r) => acc + toF(r.死球), 0) + 0.9 * (yearB.reduce((acc, r) => acc + toF(r.安打), 0) - yearB.reduce((acc, r) => acc + (toF(r.二塁打)+toF(r.三塁打)+toF(r.本塁打)), 0)) + 1.25 * yearB.reduce((acc, r) => acc + toF(r.二塁打), 0) + 1.6 * yearB.reduce((acc, r) => acc + toF(r.三塁打), 0) + 2.0 * yearB.reduce((acc, r) => acc + toF(r.本塁打), 0)) / sumPA, 
            lgFIP_C: (sumER * 9 / sumIP) - (13 * yearP.reduce((acc, r) => acc + toF(r.本塁打), 0) + 3 * (yearP.reduce((acc, r) => acc + toF(r.四球), 0) + yearP.reduce((acc, r) => acc + toF(r.死球), 0)) - 2 * yearP.reduce((acc, r) => acc + toF(r.三振), 0)) / sumIP, 
            lgR_PA: yearB.reduce((acc, r) => acc + toF(r.得点), 0) / sumPA, 
            lgERA: (sumER * 9 / sumIP)
          };
        });
        setLgStats(statsByYear);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    fetchData();
  }, [id]);

  const HelpIcon = ({ id, text }: { id: string, text: string }) => (
    <span className="relative inline-block ml-1 group">
      <button onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === id ? null : id); }} className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center font-bold">i</button>
      {activeTooltip === id && (
        <div className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black text-white text-[10px] rounded-lg shadow-xl text-center">
          {text}<div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
        </div>
      )}
    </span>
  );

  if (loading) return <div className="p-10 text-blue-600 bg-white min-h-screen font-black flex items-center justify-center animate-bounce text-2xl">データ読み込み中...</div>;
  if (!player) return <div className="p-10">選手が見つかりません</div>;

  const teamInitial = player.team_name.includes('阪神') ? 'T' : player.team_name.includes('中日') ? 'D' : 'P';
  const latest = mergedStats[0] || {};
  const latestB = latest.b || {};
  const latestP = latest.p || {};
  
  const bSaber = latest.hasBatting ? calcSaber(latest, 'B') : ({} as any);
  const pSaber = latest.hasPitching ? calcSaber(latest, 'P') : ({} as any);
  
  const totalWar = player.position_detail === '投手' ? toF(pSaber.warVal) : toF(bSaber.warVal);
  const totalRank = player.position_detail === '投手' ? getRank(toF(pSaber.warVal), 'WAR') : getRank(toF(bSaber.warVal), 'WAR');

  const isPitcher = player.position_detail === '投手';
  const predictedHR = !isPitcher && toF(latestB.試合) > 0 ? Math.round((toF(latestB.本塁打) / toF(latestB.試合)) * 143) : 0;
  
  const chartData = [...mergedStats].reverse().map((r, i) => {
    const isThisYear = i === mergedStats.length - 1;
    if (isPitcher) {
      const era = toF(r.p.防御率);
      return { 
        年度: r.年度, 
        奪三振: toF(r.p.三振 || r.p.奪三振), 
        防御率: era > 90 ? null : era, 
        isPrediction: isThisYear 
      };
    } else {
      return { 
        年度: r.年度, 
        本塁打: isThisYear ? predictedHR : toF(r.b.本塁打), 
        OPS: toF(r.b.出塁率)+toF(r.b.長打率) || toF(r.b.OPS), 
        isPrediction: isThisYear 
      };
    }
  });

  // プロフィール関連の変数定義（エラー解消箇所：必ず return の前に定義）
  const birthDateStr = player.birthday || player.birth_date;
  const generationYear = getGeneration(birthDateStr);
  const bodyInfo = player.height && player.weight 
    ? `${player.height}cm ／ ${player.weight}kg` 
    : 'データなし';

  const draftInfoNode = player.draft_year && player.draft_rank ? (
    <span className="text-sm font-black text-slate-700">
      <Link href={`/roots/draft/${player.draft_year}`} className="text-blue-600 hover:underline">{player.draft_year}年</Link>
      {' '}{player.is_developmental ? '育成' : 'ドラフト'}{player.draft_rank}位
    </span>
  ) : <span className="text-sm font-black text-slate-700">ドラフト情報なし</span>;

  const renderCareerInfo = () => {
    const items = [];
    if (player.high_school) items.push(<Link key="hs" href={`/roots/high_school/${encodeURIComponent(player.high_school)}`} className="text-blue-600 hover:underline">{player.high_school}</Link>);
    if (player.university) items.push(<Link key="uni" href={`/roots/university/${encodeURIComponent(player.university)}`} className="text-blue-600 hover:underline">{player.university}</Link>);
    if (player.prev_team_1) items.push(<Link key="prev1" href={`/roots/previous_team/${encodeURIComponent(player.prev_team_1)}`} className="text-blue-600 hover:underline">{player.prev_team_1}</Link>);
    if (player.prev_team_2) items.push(<Link key="prev2" href={`/roots/previous_team/${encodeURIComponent(player.prev_team_2)}`} className="text-blue-600 hover:underline">{player.prev_team_2}</Link>);
    if (player.prev_team_3) items.push(<Link key="prev3" href={`/roots/previous_team/${encodeURIComponent(player.prev_team_3)}`} className="text-blue-600 hover:underline">{player.prev_team_3}</Link>);
    
    if (items.length === 0) return <span className="text-sm font-black text-slate-700">経歴情報なし</span>;
  
    return (
      <span className="text-sm font-black text-slate-700 flex flex-wrap gap-x-1">
        {items.map((item, i) => (
          <span key={i} className="flex items-center">
            {item}
            {i < items.length - 1 && <span className="mx-1 text-slate-300">-</span>}
          </span>
        ))}
      </span>
    );
  };

  // アコーディオン型の Batting Data 表示
  const renderBattingAccordion = () => (
    <div key="batting" className="mb-12">
      <div className="flex justify-between items-center mb-4 px-2">
        <h2 className="text-xl font-black italic border-l-8 border-green-600 pl-4 text-slate-900 uppercase tracking-tight">Batting Data</h2>
      </div>
      <div className="flex flex-col gap-3">
        {mergedStats.filter(s => s.hasBatting).map((row, i) => {
          const s = calcSaber(row, 'B') as any;
          const isOpen = expandedB === i;
          return (
            <div key={i} className="bg-white border-[3px] border-slate-100 rounded-2xl overflow-hidden shadow-sm transition-all">
              <button 
                onClick={() => setExpandedB(isOpen ? null : i)}
                className={`w-full flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer transition-colors ${isOpen ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4 mb-3 md:mb-0">
                  <span className="font-black text-xl text-slate-800">{row.年度}</span>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{row.所属球団}</span>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto text-sm font-black text-slate-700">
                  <div className="flex gap-4 md:gap-6 text-[12px] md:text-sm flex-1 justify-around md:justify-end">
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">試合</span>{row.b.試合 || 0}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">打率</span>{dotFormat(row.b.打率)}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">HR</span>{row.b.本塁打 || 0}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">打点</span>{row.b.打点 || 0}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">OPS</span>{dotFormat(s.ops)}</div>
                  </div>
                  <div className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>
              </button>
              
              {isOpen && (
                <div className="p-4 md:p-6 bg-slate-50 border-t-[3px] border-slate-100">
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-y-6 gap-x-2 text-center text-xs">
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">打席</div><div className="font-bold text-slate-800 text-sm">{row.b.打席 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">安打</div><div className="font-bold text-slate-800 text-sm">{row.b.安打 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">二塁打</div><div className="font-bold text-slate-800 text-sm">{row.b.二塁打 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">三塁打</div><div className="font-bold text-slate-800 text-sm">{row.b.三塁打 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">盗塁</div><div className="font-bold text-slate-800 text-sm">{row.b.盗塁 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">四球</div><div className="font-bold text-slate-800 text-sm">{row.b.四球 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">死球</div><div className="font-bold text-slate-800 text-sm">{row.b.死球 || 0}</div></div>
                    
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">三振</div><div className="font-bold text-slate-800 text-sm">{row.b.三振 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">出塁率</div><div className="font-bold text-slate-800 text-sm">{dotFormat(row.b.出塁率)}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">長打率</div><div className="font-bold text-slate-800 text-sm">{dotFormat(row.b.長打率)}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">wOBA</div><div className="font-bold text-slate-800 text-sm">{dotFormat(s.woba)}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">ISOp</div><div className="font-bold text-slate-800 text-sm">{dotFormat(s.iso)}</div></div>
                    <div className="bg-white rounded-lg border py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1">wRC+</div><div className="font-black text-orange-600 text-base">{s.wrcPlus}</div></div>
                    <div className="bg-white rounded-lg border py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1">WAR</div><div className="font-black text-blue-600 text-base">{s.war}</div></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // アコーディオン型の Pitching Data 表示
  const renderPitchingAccordion = () => (
    <div key="pitching" className="mb-12">
      <div className="flex justify-between items-center mb-4 px-2">
        <h2 className="text-xl font-black italic border-l-8 border-blue-600 pl-4 text-slate-900 uppercase tracking-tight">Pitching Data</h2>
      </div>
      <div className="flex flex-col gap-3">
        {mergedStats.filter(s => s.hasPitching).map((row, i) => {
          const s = calcSaber(row, 'P') as any;
          const ip = formatIP(row.p.投球回);
          const isOpen = expandedP === i;
          return (
            <div key={i} className="bg-white border-[3px] border-slate-100 rounded-2xl overflow-hidden shadow-sm transition-all">
              <button 
                onClick={() => setExpandedP(isOpen ? null : i)}
                className={`w-full flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer transition-colors ${isOpen ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4 mb-3 md:mb-0">
                  <span className="font-black text-xl text-slate-800">{row.年度}</span>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{row.所属球団}</span>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto text-sm font-black text-slate-700">
                  <div className="flex gap-4 md:gap-6 text-[12px] md:text-sm flex-1 justify-around md:justify-end">
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">登板</span>{row.p.登板 || 0}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">防</span><span className="text-red-600">{toF(row.p.防御率).toFixed(2)}</span></div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">勝</span>{row.p.勝利 || 0}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">回</span>{row.p.投球回 || '0'}</div>
                    <div className="flex flex-col items-center"><span className="text-[9px] text-slate-400 block md:hidden">奪三振</span>{row.p.三振 || row.p.奪三振 || 0}</div>
                  </div>
                  <div className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>
              </button>
              
              {isOpen && (
                <div className="p-4 md:p-6 bg-slate-50 border-t-[3px] border-slate-100">
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-y-6 gap-x-2 text-center text-xs">
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">先発</div><div className="font-bold text-slate-800 text-sm">{row.p.先発 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">完投</div><div className="font-bold text-slate-800 text-sm">{row.p.完投 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">敗北</div><div className="font-bold text-slate-800 text-sm">{row.p.敗北 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">セーブ</div><div className="font-bold text-slate-800 text-sm">{row.p.セーブ || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">HP</div><div className="font-bold text-slate-800 text-sm">{row.p.ホールドポイント || row.p.HP || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">被安打</div><div className="font-bold text-slate-800 text-sm">{row.p.被安打 || row.p.安打 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">被本塁打</div><div className="font-bold text-slate-800 text-sm">{row.p.被本塁打 || row.p.本塁打 || 0}</div></div>
                    
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">与四球</div><div className="font-bold text-slate-800 text-sm">{row.p.与四球 || row.p.四球 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">失点</div><div className="font-bold text-slate-800 text-sm">{row.p.失点 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">自責点</div><div className="font-bold text-slate-800 text-sm">{row.p.自責点 || 0}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">K/9</div><div className="font-bold text-slate-800 text-sm">{(toF(row.p.三振 || row.p.奪三振)*9/ip).toFixed(2)}</div></div>
                    <div><div className="text-[10px] font-black text-slate-400 mb-1">BB/9</div><div className="font-bold text-slate-800 text-sm">{(toF(row.p.四球)*9/ip).toFixed(2)}</div></div>
                    <div className="bg-white rounded-lg border py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1">FIP</div><div className="font-black text-orange-600 text-base">{s.fip}</div></div>
                    <div className="bg-white rounded-lg border py-1 shadow-sm"><div className="text-[10px] font-black text-slate-400 mb-1">WAR</div><div className="font-black text-blue-600 text-base">{s.war}</div></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

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
                <span className="bg-yellow-400 text-blue-900 text-[10px] md:text-xs font-black px-3 py-1 rounded-full">{player.position_detail}</span>
                <span className="bg-gray-100 text-slate-500 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border">{player.throws_bats}</span>
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
              <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase">{player.position_detail === '投手' ? 'FIP' : 'wRC+'} <HelpIcon id="h1" text="リーグ平均を100とした創出力指標"/></span>
              <div className={rankBadge(player.position_detail === '投手' ? getRank(toF(pSaber.fipVal), 'FIP') : getRank(toF(bSaber.wrcPlusVal), 'wRC+'))}>RANK</div>
              <p className="text-slate-900 text-3xl font-black mt-2">{player.position_detail === '投手' ? pSaber.fip : bSaber.wrcPlus}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase">{player.position_detail === '投手' ? '奪三振' : 'OPS'} <HelpIcon id="h2" text="出塁率+長打率。得点相関が高い指標"/></span>
              <div className={rankBadge('S')}>STATUS</div>
              <p className="text-slate-900 text-3xl font-black mt-2">
                {player.position_detail === '投手' ? (latestP.三振 || latestP.奪三振 || 0) : dotFormat(toF(latestB.出塁率) + toF(latestB.長打率) || toF(latestB.OPS))}
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
                  {birthDateStr || '-'}
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
                  ) : '-'}
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
                <span className="text-sm font-black text-slate-700">{player.salary_estimated || '-'}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">血液型</span>
                <span className="text-sm font-black text-slate-700">{player.blood_type ? `${player.blood_type}型` : '-'}</span>
              </div>
            </div>

            <div className="md:col-span-2 flex items-baseline border-b border-slate-100 pb-2 mt-2">
              <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">経歴</span>
              {renderCareerInfo()}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-6 shadow-xl border-4 border-slate-100 mb-8 text-black">
          <h3 className="text-blue-600 font-black text-xs uppercase border-b-2 border-blue-100 pb-2 mb-4">
            {isPitcher ? '奪三振・防御率トレンド' : '本塁打・OPSトレンド'}
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
          {isPitcher ? (
            <>
              {mergedStats.some(s => s.hasPitching) && renderPitchingAccordion()}
              {renderBattingAccordion()}
            </>
          ) : (
            <>
              {renderBattingAccordion()}
              {mergedStats.some(s => s.hasPitching) && renderPitchingAccordion()}
            </>
          )}
        </section>

      </div>
      <footer className="mt-20 text-center text-gray-400 text-[10px] font-black uppercase pb-12 italic">© 2026 POWERFUL NPB ANALYTICS</footer>
    </main>
  );
}