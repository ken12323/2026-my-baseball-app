'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// 数値変換・安全性確保
const toF = (val: any): number => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

// --- ポジション補正 ---
const POSITION_ADJUSTMENT: Record<string, number> = {
  '捕手': 12.5, '遊撃手': 7.5, '二塁手': 2.5, '三塁手': 2.5, '中堅手': 2.5,
  '右翼手': -2.5, '左翼手': -2.5, '外野手': -0.8, '内野手': 0, '一塁手': -12.5, '指名打者': -17.5,
};

// --- 指標ランク判定 ---
const getRank = (value: number, type: 'FIP' | 'wRC+' | 'WAR' | 'wOBA' | 'ISOp') => {
  if (type === 'FIP') {
    if (value < 2.10) return 'SSS'; if (value < 2.60) return 'SS'; if (value < 3.10) return 'S'; if (value < 3.70) return 'A'; return 'B';
  } else if (type === 'wRC+') {
    if (value > 175) return 'SSS'; if (value > 155) return 'SS'; if (value > 135) return 'S'; if (value > 115) return 'A'; return 'B';
  } else if (type === 'WAR') {
    if (value > 6.0) return 'SSS'; if (value > 4.5) return 'SS'; if (value > 3.0) return 'S'; if (value > 1.5) return 'A'; return 'B';
  } else if (type === 'wOBA') {
    if (value > .400) return 'SSS'; if (value > .370) return 'SS'; if (value > .340) return 'S'; if (value > .310) return 'A'; return 'B';
  } else if (type === 'ISOp') {
    if (value > .250) return 'SSS'; if (value > .200) return 'SS'; if (value > .160) return 'S'; if (value > .120) return 'A'; return 'B';
  }
  return 'B';
};

const rankBadge = (rank: string) => {
  const base = "px-3 py-1 rounded-lg font-black text-white shadow-[0_4px_0_0_rgba(0,0,0,0.2)] flex items-center justify-center italic border-t border-white/30";
  if (rank === 'SSS') return `${base} bg-gradient-to-b from-yellow-300 via-orange-500 to-red-600 animate-bounce`;
  if (rank === 'SS') return `${base} bg-gradient-to-b from-slate-100 to-slate-400 text-slate-800`;
  if (rank === 'S') return `${base} bg-gradient-to-b from-amber-300 to-amber-600`;
  if (rank === 'A') return `${base} bg-gradient-to-b from-cyan-300 to-blue-600`;
  return `${base} bg-gradient-to-b from-slate-400 to-slate-600`;
};

export default function PlayerDetail() {
  const { id } = useParams();
  const [player, setPlayer] = useState<any>(null);
  const [pitching, setPitching] = useState<any[]>([]);
  const [batting, setBatting] = useState<any[]>([]);
  const [lgStats, setLgStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [pTab, setPTab] = useState('basic');
  const [bTab, setBTab] = useState('basic');
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [bCareerHighs, setBCareerHighs] = useState<Record<string, number>>({});

  // 【修正】見つからないと言われていた関数の定義を復活
  const tabBtn = (active: boolean) => `flex-1 py-3 text-sm font-black transition-all rounded-xl ${active ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`;

  const dotFormat = (val: any) => {
    const s = toF(val).toFixed(3);
    return s.startsWith('0.') ? s.substring(1) : s.startsWith('-0.') ? '-' + s.substring(2) : s;
  };

  function formatIP(ipStr: any) {
    const s = String(ipStr);
    if (!s.includes('.')) return toF(s);
    const [int, frac] = s.split('.').map(Number);
    return int + (frac === 1 ? 0.333 : frac === 2 ? 0.666 : 0);
  }

  const calcSaber = (row: any, type: 'P' | 'B') => {
    const yearData = lgStats[row.年度];
    if (!yearData) return { fip: '-', war: '0.0', woba: 0, wrcPlus: 0, iso: 0, wrcPlusVal: 0, warVal: 0, ops: 0 };
    if (type === 'P') {
      const ip = formatIP(row.投球回);
      const fipVal = ip === 0 ? 9 : (13 * toF(row.本塁打) + 3 * (toF(row.四球) + toF(row.死球)) - 2 * toF(row.三振)) / ip + yearData.lgFIP_C;
      const warVal = ((yearData.lgERA - fipVal) / 10 + 0.12) * (ip / 9);
      return { fip: fipVal.toFixed(2), war: warVal.toFixed(1), fipVal, warVal };
    } else {
      const pa = toF(row.打席);
      if (pa === 0) return { woba: 0, wrcPlus: 0, war: '0.0', iso: 0, wrcPlusVal: 0, warVal: 0, ops: 0 };
      const wobaVal = (0.7 * toF(row.四球) + 0.72 * toF(row.死球) + 0.9 * (toF(row.安打)-(toF(row.二塁打)+toF(row.三塁打)+toF(row.本塁打))) + 1.25 * toF(row.二塁打) + 1.6 * toF(row.三塁打) + 2.0 * toF(row.本塁打)) / pa;
      const wrcPlusVal = Math.round((( (wobaVal - yearData.lgwOBA) / 1.24 + yearData.lgR_PA) / yearData.lgR_PA) * 100);
      const warVal = (((wobaVal - yearData.lgwOBA) / 1.24) * pa + (POSITION_ADJUSTMENT[player?.position_detail] || 0) * (pa / 600) + (17.5 * pa / 600)) / 10;
      return { woba: wobaVal, wrcPlus: wrcPlusVal, war: warVal.toFixed(1), iso: toF(row.長打率)-toF(row.打率), wrcPlusVal, warVal, ops: toF(row.出塁率)+toF(row.長打率) };
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { data: p } = await supabase.from('players').select('*').eq('player_id', id).single();
        if (!p) { setLoading(false); return; }
        setPlayer(p);

        const nameNoSpace = p.player_name.replace(/\s+/g, '').split('').join('%');
        const cleanId = String(id).replace(/^0+/, '');

        const [allP, allB] = await Promise.all([
          supabase.from('pitching_stats').select('*').or(`player_id.eq.${id},player_id.eq.${cleanId},名前.ilike.%${nameNoSpace}%`),
          supabase.from('batting_stats').select('*').or(`player_id.eq.${id},名前.ilike.%${nameNoSpace}%`)
        ]);

        const processStats = (data: any[]) => (data || []).map(row => ({
          ...row, 年度: Number(row.年度)
        })).sort((a, b) => b.年度 - a.年度);

        setPitching(processStats(allP.data || []));
        setBatting(processStats(allB.data || []));

        const years = Array.from(new Set([...(allP.data || []).map(s => Number(s.年度)), ...(allB.data || []).map(s => Number(s.年度))]));
        if (years.length === 0) { setLoading(false); return; }

        const yearStrings = years.map(String);
        const [{ data: lgB }, { data: lgP }] = await Promise.all([
          supabase.from('batting_stats').select('*').in('年度', yearStrings),
          supabase.from('pitching_stats').select('*').in('年度', yearStrings)
        ]);

        const statsByYear: Record<string, any> = {};
        years.forEach(year => {
          const yearB = lgB?.filter(r => Number(r.年度) === year) || [];
          const yearP = lgP?.filter(r => Number(r.年度) === year) || [];
          const sumPA = yearB.reduce((acc, r) => acc + toF(r.打席), 0) || 1;
          const sumIP = yearP.reduce((acc, r) => acc + formatIP(r.投球回), 0) || 1;
          const sumER = yearP.reduce((acc, r) => acc + toF(r.自責点), 0);
          const lgERA = (sumER * 9) / sumIP;
          const rawFIP = (13 * yearP.reduce((acc, r) => acc + toF(r.本塁打), 0) + 3 * (yearP.reduce((acc, r) => acc + toF(r.四球), 0) + yearP.reduce((acc, r) => acc + toF(r.死球), 0)) - 2 * yearP.reduce((acc, r) => acc + toF(r.三振), 0)) / sumIP;
          statsByYear[year] = { 
            lgwOBA: (0.7 * yearB.reduce((acc, r) => acc + toF(r.四球), 0) + 0.72 * yearB.reduce((acc, r) => acc + toF(r.死球), 0) + 0.9 * (yearB.reduce((acc, r) => acc + toF(r.安打), 0) - yearB.reduce((acc, r) => acc + (toF(r.二塁打)+toF(r.三塁打)+toF(r.本塁打)), 0)) + 1.25 * yearB.reduce((acc, r) => acc + toF(r.二塁打), 0) + 1.6 * yearB.reduce((acc, r) => acc + toF(r.三塁打), 0) + 2.0 * yearB.reduce((acc, r) => acc + toF(r.本塁打), 0)) / sumPA, 
            lgFIP_C: lgERA - rawFIP, lgR_PA: yearB.reduce((acc, r) => acc + toF(r.得点), 0) / sumPA, lgERA 
          };
        });
        setLgStats(statsByYear);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    if (batting.length > 1 && Object.keys(lgStats).length > 0) {
      const past = batting.slice(1);
      const highs: any = {};
      const basicKeys = ['打率', '試合', '打席', '安打', '本塁打', '打点', '盗塁', '出塁率', '長打率'];
      basicKeys.forEach(m => highs[m] = Math.max(...past.map(r => toF(r[m]))));
      const saberStats = past.map(r => {
        const s = calcSaber(r, 'B');
        return { WAR: toF(s.warVal), 'wRC+': toF(s.wrcPlusVal), wOBA: toF(s.woba), OPS: toF(s.ops), ISOp: toF(s.iso) };
      });
      const saberKeys = ['WAR', 'wRC+', 'wOBA', 'OPS', 'ISOp'];
      saberKeys.forEach(m => highs[m] = Math.max(...saberStats.map((s:any) => s[m])));
      setBCareerHighs(highs);
    }
  }, [batting, lgStats]);

  if (loading) return <div className="p-10 text-blue-600 bg-white min-h-screen font-black flex items-center justify-center animate-bounce text-2xl">データ読み込み中！</div>;
  if (!player) return <div className="p-10 text-slate-900">選手が見つかりませんでした</div>;

  const teamInitial = player.team_name.includes('阪神') ? 'T' : player.team_name.includes('中日') ? 'D' : 'P';
  const latestB = batting[0];
  const bSaber = latestB ? calcSaber(latestB, 'B') : ({} as any);
  const totalWar = player.position_detail === '投手' ? (pitching[0] ? toF(calcSaber(pitching[0], 'P').warVal) : 0) : bSaber.warVal;
  const totalRank = player.position_detail === '投手' ? getRank(totalWar, 'WAR') : getRank(bSaber.wrcPlusVal, 'wRC+');

  const currentGames = latestB ? toF(latestB.試合) : 0;
  const predictedHR = currentGames > 0 ? Math.round((toF(latestB?.本塁打) / currentGames) * 143) : 0;
  const chartData = [...batting].reverse().map((r, i) => {
    const isThisYear = i === batting.length - 1;
    return { 年度: r.年度, 本塁打: isThisYear ? predictedHR : toF(r.本塁打), OPS: toF(r.出塁率)+toF(r.長打率), isPrediction: isThisYear };
  });

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

  return (
    <main className="min-h-screen bg-gray-50 p-2 md:p-10 text-slate-900 font-sans tracking-tight" onClick={() => setActiveTooltip(null)}>
      <div className="max-w-2xl mx-auto relative">
        <div className="absolute -top-6 right-0 bg-red-600 text-white text-[10px] px-3 py-1 rounded-full font-black shadow-lg animate-pulse">NEW UI v2.5 ACTIVE</div>
        <Link href="/" className="text-blue-600 font-black mb-4 inline-block px-2">← メニューへ戻る</Link>
        
        <header className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border-[6px] border-blue-600 mb-8 p-6 md:p-8">
          <div className="flex justify-between items-start gap-4 mb-8">
            <div className="flex flex-col flex-1">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-blue-100 flex items-center justify-center overflow-hidden shadow-inner mb-4 bg-white relative">
                <img src={`/images/avatars/${teamInitial}_${player.position_detail === '投手' ? 'pitcher_right' : 'batter_right'}.png`} alt="avatar" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = "/images/avatars/default.png"; }} />
                <div className="absolute bottom-0 right-0 bg-blue-600 text-white font-black italic px-3 py-1 text-2xl rounded-tl-2xl border-t-2 border-l-2 border-white shadow-lg">
                  #{latestB?.背番号 || '--'}
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
                <span className="text-6xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-b from-yellow-400 to-orange-600 leading-none drop-shadow-md">{totalRank}</span>
                <p className="text-[9px] font-black text-slate-400 mt-2 uppercase tracking-widest text-center">WAR {toF(totalWar).toFixed(1)}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 text-center">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase">wRC+ <HelpIcon id="w" text="平均を100とした打撃創出力"/></span>
              <div className={rankBadge(getRank(bSaber.wrcPlusVal, 'wRC+'))}>{getRank(bSaber.wrcPlusVal, 'wRC+')}</div>
              <p className="text-slate-900 text-3xl font-black mt-2">{bSaber.wrcPlus}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 block mb-2 uppercase">OPS <HelpIcon id="o" text="出塁率＋長打率。得点相関が高い指標"/></span>
              <div className={rankBadge('S')}>STATUS</div>
              <p className="text-slate-900 text-3xl font-black mt-2">{dotFormat(bSaber.ops)}</p>
            </div>
          </div>
        </header>

        <div className="bg-white rounded-[2rem] p-6 md:p-10 shadow-xl border-4 border-slate-100 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-blue-600 font-black text-xs uppercase border-b-2 border-blue-100 pb-2">プロフィール</h3>
              <div className="grid grid-cols-1 gap-4 text-sm font-black text-slate-900">
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">生年月日</span>{player.birthday}</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">身長 / 体重</span>{player.height}cm / {player.weight}kg</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">出身校</span>{player.high_school} {player.university && `/ ${player.university}`}</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold underline decoration-blue-200 decoration-2">ドラフト指名</span>{player.draft_year}年：{player.draft_rank}位指名</p>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-blue-600 font-black text-xs uppercase border-b-2 border-blue-100 pb-2">年度別成績トレンド</h3>
              <div className="h-48 w-full bg-slate-50 rounded-2xl p-3 border border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="年度" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" fontSize={10} axisLine={false} tickLine={false} domain={[0, 'dataMax + 5']} />
                    <YAxis yAxisId="right" orientation="right" fontSize={10} axisLine={false} tickLine={false} domain={['dataMin - 0.05', 'dataMax + 0.05']} />
                    <ChartTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }} 
                      formatter={(value: any, name: any, props: any) => {
                        const v = toF(value);
                        if (name === '本塁打' && props.payload.isPrediction) return [`${v}本 (ペース予測)`, name];
                        return [name === 'OPS' ? v.toFixed(3) : `${v}本`, name];
                      }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="本塁打" stroke="#ef4444" strokeWidth={5} dot={{ r: 5, fill: '#fff' }} />
                    <Line yAxisId="right" type="monotone" dataKey="OPS" stroke="#3b82f6" strokeWidth={5} dot={{ r: 5, fill: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <section className="mb-20 space-y-12">
          {batting.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-6 px-2">
                <h2 className="text-xl font-black italic border-l-8 border-green-600 pl-4 text-slate-900 uppercase">Batting Data</h2>
                <div className="flex bg-slate-200 p-1 rounded-xl w-32 shadow-inner">
                  <button onClick={() => setBTab('basic')} className={tabBtn(bTab === 'basic')}>基本</button>
                  <button onClick={() => setBTab('saber')} className={tabBtn(bTab === 'saber')}>分析</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border-4 border-slate-100 shadow-2xl bg-white relative">
                <table className="w-full text-xs text-left border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                    <tr>
                      <th className="sticky left-0 z-30 bg-slate-50 p-4 border-b">年度</th><th className="sticky left-[60px] z-30 bg-slate-50 p-4 border-b">球団</th>
                      {bTab === 'basic' ? (
                        <><th className="p-4 border-b text-right">打率</th><th className="p-4 border-b text-right">試合</th><th className="p-4 border-b text-right">安打</th><th className="p-4 border-b text-right">本塁打</th><th className="p-4 border-b text-right">打点</th><th className="p-4 border-b text-right">盗塁</th><th className="p-4 border-b text-right">出塁率</th><th className="p-4 border-b text-right">長打率</th></>
                      ) : (
                        <><th className="p-4 border-b text-right font-black">WAR</th><th className="p-4 border-b text-right font-black">wOBA</th><th className="p-4 border-b text-right font-black italic">wRC+</th><th className="p-4 border-b text-right font-black">OPS</th><th className="p-4 border-b text-right font-black">ISOp</th></>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-900">
                    {batting.map((row, i) => {
                      const s = calcSaber(row, 'B') as any;
                      const isH = (key: string, val: any) => i !== 0 && toF(val) >= (bCareerHighs[key] || 0);
                      const cellBg = i % 2 !== 0 ? "bg-slate-200" : "bg-white"; // 濃い目のストライプ
                      return (
                        <tr key={i}>
                          <td className={`sticky left-0 z-20 ${cellBg} p-4 font-black border-r border-slate-100`}>{row.年度}</td>
                          <td className={`sticky left-[60px] z-20 ${cellBg} p-4 font-black text-slate-400 border-r border-slate-100`}>{row.所属球団}</td>
                          {bTab === 'basic' ? (
                            <>
                              <td className={`p-4 text-right font-mono ${cellBg} ${isH('打率', row.打率) ? 'text-red-600 font-black' : ''}`}>{dotFormat(row.打率)}</td>
                              <td className={`p-4 text-right ${cellBg} ${isH('試合', row.試合) ? 'text-red-600 font-black' : ''}`}>{row.試合}</td>
                              <td className={`p-4 text-right font-mono ${cellBg} ${isH('安打', row.安打) ? 'text-red-600 font-black' : ''}`}>{row.安打}</td>
                              <td className={`p-4 text-right font-mono ${cellBg} ${isH('本塁打', row.本塁打) ? 'text-red-600 font-black' : ''}`}>{row.本塁打}</td>
                              <td className={`p-4 text-right font-mono ${cellBg} ${isH('打点', row.打点) ? 'text-red-600 font-black' : ''}`}>{row.打点}</td>
                              <td className={`p-4 text-right ${cellBg} ${isH('盗塁', row.盗塁) ? 'text-red-600 font-black' : ''}`}>{row.盗塁}</td>
                              <td className={`p-4 text-right font-mono ${cellBg} ${isH('出塁率', row.出塁率) ? 'text-red-600 font-black' : ''}`}>{dotFormat(row.出塁率)}</td>
                              <td className={`p-4 text-right font-mono ${cellBg} ${isH('長打率', row.長打率) ? 'text-red-600 font-black' : ''}`}>{dotFormat(row.長打率)}</td>
                            </>
                          ) : (
                            <>
                              <td className={`p-4 text-right font-mono font-black ${cellBg} ${isH('WAR', s.warVal) ? 'text-red-600 font-black' : ''}`}>{s.war}</td>
                              <td className={`p-4 text-right font-mono font-black ${cellBg} ${isH('wOBA', s.woba) ? 'text-red-600 font-black' : ''}`}>{dotFormat(s.woba)}</td>
                              <td className={`p-4 text-right font-mono font-black ${cellBg} ${isH('wRC+', s.wrcPlusVal) ? 'text-red-600 font-black' : ''}`}>{s.wrcPlus}</td>
                              <td className={`p-4 text-right font-mono font-black ${cellBg} ${isH('OPS', s.ops) ? 'text-red-600 font-black' : ''}`}>{toF(s.ops).toFixed(3)}</td>
                              <td className={`p-4 text-right font-mono font-black ${cellBg} ${isH('ISOp', s.iso) ? 'text-red-600 font-black' : ''}`}>{dotFormat(s.iso)}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}