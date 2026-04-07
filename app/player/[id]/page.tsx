'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// --- ポジション補正 ---
const POSITION_ADJUSTMENT: Record<string, number> = {
  '捕手': 12.5, '遊撃手': 7.5, '二塁手': 2.5, '三塁手': 2.5, '中堅手': 2.5,
  '右翼手': -2.5, '左翼手': -2.5, '外野手': -0.8, '内野手': 0, '一塁手': -12.5, '指名打者': -17.5,
};

// --- ランク判定ロジック ---
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

const toF = (val: any) => parseFloat(val) || 0;

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

  if (loading) return <div className="p-10 text-blue-600 bg-white min-h-screen font-black flex items-center justify-center animate-bounce text-2xl">データ読み込み中！</div>;
  if (!player) return <div className="p-10">選手が見つかりませんでした</div>;

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
      const warVal = (((wobaVal - yearData.lgwOBA) / 1.24) * pa + (POSITION_ADJUSTMENT[player.position_detail] || 0) * (pa / 600) + (17.5 * pa / 600)) / 10;
      return { woba: wobaVal, wrcPlus: wrcPlusVal, war: warVal.toFixed(1), iso: toF(row.長打率)-toF(row.打率), wrcPlusVal, warVal, ops: toF(row.出塁率)+toF(row.長打率) };
    }
  };

  // --- キャリアハイ判定ロジック (全項目) ---
  const getHigh = (arr: any[], key: string, isOps = false) => {
    const pastData = arr.slice(1); // 今年度を除外
    if (pastData.length === 0) return -1;
    return Math.max(...pastData.map(r => isOps ? toF(r.出塁率)+toF(r.長打率) : toF(r[key])));
  };

  const bHighs = {
    打率: getHigh(batting, '打率'), 安打: getHigh(batting, '安打'), 本塁打: getHigh(batting, '本塁打'),
    打点: getHigh(batting, '打点'), 盗塁: getHigh(batting, '盗塁'), 出塁率: getHigh(batting, '出塁率'),
    長打率: getHigh(batting, '長打率'), OPS: getHigh(batting, '', true)
  };

  const pHighs = {
    勝利: getHigh(pitching, '勝利'), セーブ: getHigh(pitching, 'セーブ'), ホールド: getHigh(pitching, 'ホールド'),
    HP: getHigh(pitching, 'HP'), 三振: getHigh(pitching, '三振'), 投球回: getHigh(pitching, '投球回')
    // 防御率は低い方が良いため除外または別途ロジックが必要
  };

  const isPitcher = player.position_detail === '投手';
  const getInitialByTeamName = (teamName: string): string => {
    if (teamName.includes('阪神')) return 'T'; if (teamName.includes('巨人')) return 'G';
    if (teamName.includes('中日')) return 'D'; if (teamName.includes('ＤｅＮＡ')) return 'YB';
    if (teamName.includes('広島')) return 'C'; if (teamName.includes('ヤクルト')) return 'S';
    if (teamName.includes('ソフトバンク')) return 'H'; if (teamName.includes('西武')) return 'L';
    if (teamName.includes('ロッテ')) return 'M'; if (teamName.includes('オリックス')) return 'B';
    if (teamName.includes('楽天')) return 'E'; if (teamName.includes('日本ハム')) return 'F';
    return 'P';
  };

  const teamInitial = getInitialByTeamName(player.team_name);
  const selectedAvatarPath = `/images/avatars/default.png`; 

  const latestP = pitching[0];
  const latestB = batting[0];
  const pSaber = latestP ? calcSaber(latestP, 'P') : ({} as any);
  const bSaber = latestB ? calcSaber(latestB, 'B') : ({} as any);
  const totalWar = isPitcher ? toF(pSaber.warVal) : toF(bSaber.warVal);
  const totalRank = isPitcher ? getRank(totalWar, 'WAR') : getRank(bSaber.wrcPlusVal, 'wRC+');

  const stickyYearHeader = "sticky left-0 z-30 bg-gray-200 min-w-[60px] shadow-[1px_0_0_0_#ccc]";
  const stickyYearCell = "sticky left-0 z-10 bg-white min-w-[60px] border-r shadow-sm";
  const stickyTeamHeader = "sticky left-[60px] z-30 bg-gray-200 min-w-[80px] shadow-[1px_0_0_0_#ccc]";
  const stickyTeamCell = "sticky left-[60px] z-10 bg-white min-w-[80px] border-r shadow-sm";
  const tabBtn = (active: boolean) => `flex-1 py-3 text-sm font-black transition-all rounded-xl ${active ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`;

  const chartData = [...batting].reverse().map(r => ({ 年度: r.年度, HR: toF(r.本塁打), OPS: toF(r.出塁率)+toF(r.長打率) }));

  // ツールチップ用
  const HelpIcon = ({ id, text }: { id: string, text: string }) => (
    <span className="relative inline-block ml-1 group">
      <button 
        onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === id ? null : id); }}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center font-bold"
      >i</button>
      {activeTooltip === id && (
        <div className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black text-white text-[10px] rounded-lg shadow-xl leading-tight">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
        </div>
      )}
    </span>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-2 md:p-10 text-slate-900 font-sans tracking-tight" onClick={() => setActiveTooltip(null)}>
      <div className="max-w-2xl mx-auto relative">
        <div className="absolute -top-6 right-0 bg-red-600 text-white text-[10px] px-3 py-1 rounded-full font-black shadow-lg">NEW UI v2.3 ACTIVE</div>
        <Link href="/" className="text-blue-600 font-black mb-4 inline-block px-2 transition-transform hover:-translate-x-1">← メニューへ戻る</Link>
        
        <header className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border-[6px] border-blue-600 mb-8 p-6 md:p-8">
          <div className="flex justify-between items-start gap-4 mb-8">
            <div className="flex flex-col flex-1">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-blue-100 flex items-center justify-center overflow-hidden shadow-inner mb-4 bg-white relative">
                <img src={selectedAvatarPath} alt={player.player_name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = "/images/avatars/default.png"; }} />
                {/* 【背番号】成績から取得。なければハイフン */}
                <div className="absolute bottom-0 right-0 bg-blue-600 text-white font-black italic px-3 py-1 text-2xl rounded-tl-2xl border-t-2 border-l-2 border-white shadow-lg">
                  #{isPitcher ? (latestP?.背番号 || '--') : (latestB?.背番号 || '--')}
                </div>
              </div>
              <p className="text-blue-500 font-black text-xs md:text-sm mb-1">{player.team_name}</p>
              <h1 className="text-4xl md:text-5xl font-black text-blue-900 leading-none tracking-tighter mb-4 italic">{player.player_name}</h1>
              <div className="flex gap-2">
                <span className="bg-yellow-400 text-blue-900 text-[10px] md:text-xs font-black px-3 py-1 rounded-full shadow-sm">{player.position_detail}</span>
                <span className="bg-gray-100 text-slate-500 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border">{player.throws_bats}</span>
              </div>
            </div>
            <div className="flex flex-col items-center w-28 md:w-36 flex-shrink-0">
              <span className="bg-blue-600 text-white text-[10px] md:text-xs font-black px-4 py-1.5 rounded-t-xl w-full text-center">総合評価</span>
              <div className="bg-blue-50 w-full flex flex-col items-center justify-center py-4 md:py-6 rounded-b-xl border-2 border-blue-600 shadow-inner">
                <span className="text-6xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-b from-yellow-400 to-orange-600 leading-none">{totalRank}</span>
                <div className="mt-2 text-center">
                  <p className="text-[9px] font-black text-slate-400">貢献度 (WAR)</p>
                  <p className="text-2xl font-black text-blue-900">{totalWar.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-400 mb-2">打撃指標 (wRC+) <HelpIcon id="wrc" text="100を平均とした打席あたりの得点創出力。球場補正込み。" /></span>
              <div className={rankBadge(getRank(bSaber.wrcPlusVal, 'wRC+'))}>{getRank(bSaber.wrcPlusVal, 'wRC+')}</div>
              <p className="text-slate-900 text-3xl font-black mt-2">{bSaber.wrcPlus}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-400 mb-2">総合力 (OPS) <HelpIcon id="ops" text="出塁率＋長打率。得点相関が非常に高い指標。" /></span>
              <div className={rankBadge('S')}>STATUS</div>
              <p className="text-slate-900 text-3xl font-black mt-2">{dotFormat(toF(latestB?.出塁率)+toF(latestB?.長打率))}</p>
            </div>
          </div>
        </header>

        {/* トレンドグラフ */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl border-4 border-slate-100 mb-8">
           <h3 className="text-blue-600 font-black text-xs uppercase mb-4 border-b pb-2 flex justify-between items-center">
             <span>年度別成績トレンド (HR / OPS)</span>
             <span className="text-[9px] text-slate-400 font-normal">※青=OPS, 赤=HR</span>
           </h3>
           <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: -30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="年度" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  <ChartTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="HR" stroke="#ef4444" strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                  <Line type="monotone" dataKey="OPS" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* 成績テーブル */}
        <section className="mb-20 space-y-12">
          {pitching.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-xl font-black italic border-l-8 border-red-600 pl-4">PITCHING</h2>
                <div className="flex bg-slate-200 p-1 rounded-xl w-32 shadow-inner overflow-hidden">
                  <button onClick={() => setPTab('basic')} className={tabBtn(pTab === 'basic')}>基本</button>
                  <button onClick={() => setPTab('saber')} className={tabBtn(pTab === 'saber')}>分析</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border-4 border-slate-100 shadow-2xl bg-white relative">
                <table className="w-full text-xs text-left whitespace-nowrap border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                    <tr>
                      <th className={stickyYearHeader + " bg-slate-50 p-4 border-b"}>年度</th><th className={stickyTeamHeader + " bg-slate-50 p-4 border-b"}>球団</th>
                      {pTab === 'basic' ? (
                        <><th className="p-4 border-b text-right">防御率</th><th className="p-4 border-b text-right">登板</th><th className="p-4 border-b text-right">勝利</th><th className="p-4 border-b text-right">敗戦</th><th className="p-4 border-b text-right">セーブ</th><th className="p-4 border-b text-right">ホールド</th><th className="p-4 border-b text-right">HP</th><th className="p-4 border-b text-right">投球回</th><th className="p-4 border-b text-right">三振</th></>
                      ) : (
                        <><th className="p-4 border-b text-right">WAR</th><th className="p-4 border-b text-right">FIP</th><th className="p-4 border-b text-right">WHIP</th><th className="p-4 border-b text-right">K/BB</th><th className="p-4 border-b text-right">K/9</th><th className="p-4 border-b text-right">BB/9</th></>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pitching.map((row, i) => {
                      const s = calcSaber(row, 'P') as any;
                      const isH = (key: string, val: any) => i !== 0 && toF(val) === (pHighs as any)[key];
                      return (
                        <tr key={i} className="even:bg-slate-50/80 transition-colors">
                          <td className={stickyYearCell + (i % 2 !== 0 ? " bg-slate-50/80" : " bg-white") + " p-4 font-black"}>{row.年度}</td>
                          <td className={stickyTeamCell + (i % 2 !== 0 ? " bg-slate-50/80" : " bg-white") + " p-4 font-black text-slate-400"}>{row.所属球団}</td>
                          {pTab === 'basic' ? (
                            <><td className="p-4 text-right font-mono">{(toF(row.防御率)).toFixed(2)}</td><td className="p-4 text-right">{row.登板}</td><td className={`p-4 text-right font-mono ${isH('勝利', row.勝利) ? 'text-red-600 font-black' : ''}`}>{row.勝利}</td><td className="p-4 text-right">{row.敗戦}</td><td className={`p-4 text-right font-mono ${isH('セーブ', row.セーブ) ? 'text-red-600 font-black' : ''}`}>{row.セーブ}</td><td className={`p-4 text-right font-mono ${isH('ホールド', row.ホールド) ? 'text-red-600 font-black' : ''}`}>{row.ホールド}</td><td className={`p-4 text-right font-mono ${isH('HP', row.HP) ? 'text-red-600 font-black' : ''}`}>{row.HP}</td><td className={`p-4 text-right font-mono ${isH('投球回', row.投球回) ? 'text-red-600 font-black' : ''}`}>{row.投球回}</td><td className={`p-4 text-right font-mono ${isH('三振', row.三振) ? 'text-red-600 font-black' : ''}`}>{row.三振}</td></>
                          ) : (
                            <><td className="p-4 text-right font-mono">{s.war}</td><td className="p-4 text-right font-mono">{s.fip}</td><td className="p-4 text-right font-mono">{formatIP(row.投球回) === 0 ? '.00' : ((toF(row.安打)+toF(row.四球))/formatIP(row.投球回)).toFixed(2)}</td><td className="p-4 text-right font-mono">{(toF(row.三振)/toF(row.四球) || 0).toFixed(2)}</td><td className="p-4 text-right font-mono">{(toF(row.三振)*9/formatIP(row.投球回)).toFixed(2)}</td><td className="p-4 text-right font-mono">{((toF(row.四球)+toF(row.死球))*9/formatIP(row.投球回)).toFixed(2)}</td></>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {batting.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-xl font-black italic border-l-8 border-green-600 pl-4">BATTING</h2>
                <div className="flex bg-slate-200 p-1 rounded-xl w-32 shadow-inner overflow-hidden">
                  <button onClick={() => setBTab('basic')} className={tabBtn(bTab === 'basic')}>基本</button>
                  <button onClick={() => setBTab('saber')} className={tabBtn(bTab === 'saber')}>分析</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border-4 border-slate-100 shadow-2xl bg-white relative">
                <table className="w-full text-xs text-left whitespace-nowrap border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                    <tr>
                      <th className={stickyYearHeader + " bg-slate-50 p-4 border-b"}>年度</th><th className={stickyTeamHeader + " bg-slate-50 p-4 border-b"}>球団</th>
                      {bTab === 'basic' ? (
                        <><th className="p-4 border-b text-right">打率</th><th className="p-4 border-b text-right">試合</th><th className="p-4 border-b text-right">安打</th><th className="p-4 border-b text-right">本塁打</th><th className="p-4 border-b text-right">打点</th><th className="p-4 border-b text-right">盗塁</th><th className="p-4 border-b text-right">出塁率</th><th className="p-4 border-b text-right">長打率</th></>
                      ) : (
                        <><th className="p-4 border-b text-right">WAR</th><th className="p-4 border-b text-right">wOBA</th><th className="p-4 border-b text-right">wRC+</th><th className="p-4 border-b text-right">OPS</th><th className="p-4 border-b text-right">ISOp</th></>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batting.map((row, i) => {
                      const ops = toF(row.出塁率) + toF(row.長打率);
                      const isH = (key: string, val: any) => i !== 0 && toF(val) === (bHighs as any)[key];
                      const isOpsHigh = i !== 0 && ops === (bHighs as any)['OPS'];
                      const s = calcSaber(row, 'B') as any;

                      return (
                        <tr key={i} className="even:bg-slate-50/80 transition-colors">
                          <td className={stickyYearCell + (i % 2 !== 0 ? " bg-slate-50/80" : " bg-white") + " p-4 font-black"}>{row.年度}</td>
                          <td className={stickyTeamCell + (i % 2 !== 0 ? " bg-slate-50/80" : " bg-white") + " p-4 font-black text-slate-400"}>{row.所属球団}</td>
                          {bTab === 'basic' ? (
                            <><td className={`p-4 text-right font-mono ${isH('打率', row.打率) ? 'text-red-600 font-black' : ''}`}>{dotFormat(row.打率)}</td><td className="p-4 text-right">{row.試合}</td><td className={`p-4 text-right font-mono ${isH('安打', row.安打) ? 'text-red-600 font-black' : ''}`}>{row.安打}</td><td className={`p-4 text-right font-mono ${isH('本塁打', row.本塁打) ? 'text-red-600 font-black' : ''}`}>{row.本塁打}</td><td className={`p-4 text-right font-mono ${isH('打点', row.打点) ? 'text-red-600 font-black' : ''}`}>{row.打点}</td><td className={`p-4 text-right font-mono ${isH('盗塁', row.盗塁) ? 'text-red-600 font-black' : ''}`}>{row.盗塁}</td><td className={`p-4 text-right font-mono ${isH('出塁率', row.出塁率) ? 'text-red-600 font-black' : ''}`}>{dotFormat(row.出塁率)}</td><td className={`p-4 text-right font-mono ${isH('長打率', row.長打率) ? 'text-red-600 font-black' : ''}`}>{dotFormat(row.長打率)}</td></>
                          ) : (
                            <><td className="p-4 text-right font-mono font-black">{s.war}</td><td className="p-4 text-right font-mono">{dotFormat(s.woba)}</td><td className="p-4 text-right font-mono font-black">{s.wrcPlus}</td><td className={`p-4 text-right font-mono font-black ${isOpsHigh ? 'text-red-600' : ''}`}>{(ops).toFixed(3)}</td><td className="p-4 text-right font-mono text-slate-500">{dotFormat(s.iso)}</td></>
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
      <footer className="mt-20 text-center text-gray-400 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">© 2026 POWERFUL NPB ANALYTICS</footer>
    </main>
  );
}