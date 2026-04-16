'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// --- 数値変換・安全性確保 ---
const toF = (val: any): number => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

// --- ポジション補正 ---
const POSITION_ADJUSTMENT: Record<string, number> = {
  '捕手': 12.5, '遊撃手': 7.5, '二塁手': 2.5, '三塁手': 2.5, '中堅手': 2.5,
  '右翼手': -2.5, '左翼手': -2.5, '外野手': -0.8, '内野手': 0, '一塁手': -12.5, '指名打者': -17.5,
};

// --- パークファクター定数 (2021〜2025年の過去5年平均) ---
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

// --- 指標ランク判定 ---
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

export default function PlayerDetail() {
  const { id } = useParams();
  const [player, setPlayer] = useState<any>(null);
  const [mergedStats, setMergedStats] = useState<any[]>([]);
  const [lgStats, setLgStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [pTab, setPTab] = useState('basic');
  const [bTab, setBTab] = useState('basic');
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [careerHighs, setCareerHighs] = useState<Record<string, number>>({});

  const tabBtn = (active: boolean) => `flex-1 py-3 text-sm font-black transition-all rounded-xl ${active ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`;

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
      const ip = formatIP(row.投球回);
      if (ip === 0) return { fip: '-', war: '0.0', fipVal: 0, warVal: 0 };
      const fipVal = (13 * toF(row.本塁打) + 3 * (toF(row.四球) + toF(row.死球)) - 2 * toF(row.三振)) / ip + yearData.lgFIP_C;
      const warVal = ((yearData.lgERA - fipVal) / 10 + 0.12) * (ip / 9);
      return { fip: fipVal.toFixed(2), war: warVal.toFixed(1), fipVal, warVal };
    } else {
      const pa = toF(row.打席);
      if (pa === 0) return { woba: 0, wrcPlus: 0, war: '0.0', iso: 0, wrcPlusVal: 0, warVal: 0, ops: 0 };
      
      const wobaVal = (0.7 * toF(row.四球) + 0.72 * toF(row.死球) + 0.9 * (toF(row.安打)-(toF(row.二塁打)+toF(row.三塁打)+toF(row.本塁打))) + 1.25 * toF(row.二塁打) + 1.6 * toF(row.三塁打) + 2.0 * toF(row.本塁打)) / pa;
      
      // パークファクターの適用
      let teamName = row.所属球団 || player?.team_name || '';
      teamName = teamName.replace('タイガース', '').replace('ジャイアンツ', '').replace('ベイスターズ', '').replace('ドラゴンズ', '').replace('スワローズ', '').replace('カープ', '').replace('ゴールデンイーグルス', '').replace('マリーンズ', '').replace('ファイターズ', '').replace('ライオンズ', '').replace('バファローズ', '').replace('ホークス', '');
      
      const basePF = PARK_FACTORS[teamName] || 1.00;
      const adjPF = (basePF + 1.0) / 2.0;

      // wRC+ と WAR をパークファクターで補正
      const wrcPlusVal = Math.round(((((wobaVal - yearData.lgwOBA) / 1.24 + yearData.lgR_PA) + (yearData.lgR_PA - (adjPF * yearData.lgR_PA))) / yearData.lgR_PA) * 100);
      
      const battingRuns = ((wobaVal - yearData.lgwOBA) / 1.24) * pa;
      const parkCorrectedRuns = battingRuns + (yearData.lgR_PA - (adjPF * yearData.lgR_PA)) * pa;
      const warVal = (parkCorrectedRuns + (POSITION_ADJUSTMENT[player?.position_detail] || 0) * (pa / 600) + (17.5 * pa / 600)) / 10;
      
      const opsVal = row.OPS ? toF(row.OPS) : (toF(row.出塁率) + toF(row.長打率));
      
      return { woba: wobaVal, wrcPlus: wrcPlusVal, war: warVal.toFixed(1), iso: toF(row.長打率)-toF(row.打率), wrcPlusVal, warVal, ops: opsVal };
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // ★鉄則：URLから取得したIDを確実に8桁の文字列化
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
        [...(allB.data || []), ...(allP.data || [])].forEach(s => {
          const year = Number(s.年度);
          const existing = statsMap.get(year) || { 年度: year, 所属球団: p.team_name };
          statsMap.set(year, { 
            ...existing, 
            ...s, 
            所属球団: s.所属球団 || s.球団 || existing.所属球団,
            hasBatting: existing.hasBatting || (s.打席 !== undefined || s.安打 !== undefined),
            hasPitching: existing.hasPitching || (s.防御率 !== undefined || s.登板 !== undefined)
          });
        });

        const merged = Array.from(statsMap.values()).sort((a, b) => b.年度 - a.年度);
        setMergedStats(merged);

        const highs: Record<string, number> = {};
        const past = merged.slice(1);
        if (past.length > 0) {
          ['安打', '本塁打', '打点', '勝利', '三振'].forEach(key => {
            highs[key] = Math.max(...past.map(r => toF(r[key])));
          });
          setCareerHighs(highs);
        }

        // ★鉄則：年度は確実に数値（Number）として抽出
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
  const bSaber = latest.hasBatting ? calcSaber(latest, 'B') : ({} as any);
  const pSaber = latest.hasPitching ? calcSaber(latest, 'P') : ({} as any);
  
  const totalWar = player.position_detail === '投手' ? toF(pSaber.warVal) : toF(bSaber.warVal);
  const totalRank = player.position_detail === '投手' ? getRank(toF(pSaber.warVal), 'WAR') : getRank(toF(bSaber.warVal), 'WAR');

  const predictedHR = toF(latest.試合) > 0 ? Math.round((toF(latest.本塁打) / toF(latest.試合)) * 143) : 0;
  const chartData = [...mergedStats].reverse().map((r, i) => {
    const isThisYear = i === mergedStats.length - 1;
    return { 年度: r.年度, 本塁打: isThisYear ? predictedHR : toF(r.本塁打), OPS: toF(r.出塁率)+toF(r.長打率), isPrediction: isThisYear };
  });

  // ★プロフィール表示用のデータ整形ロジック
  const careerHistory = [
    player.high_school, 
    player.university, 
    player.prev_team_1, 
    player.prev_team_2, 
    player.prev_team_3
  ].filter(Boolean).join(' - ') || '経歴情報なし';

  const draftInfo = player.draft_year && player.draft_rank
    ? `${player.draft_year}年 ${player.is_developmental ? '育成' : 'ドラフト'}${player.draft_rank}位`
    : 'ドラフト情報なし';

  const bodyInfo = player.height && player.weight 
    ? `${player.height}cm ／ ${player.weight}kg` 
    : 'データなし';

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
                  #{latest?.背番号 || '--'}
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
                {player.position_detail === '投手' ? (latest.三振 || 0) : dotFormat(toF(latest.出塁率) + toF(latest.長打率) || toF(latest.OPS))}
              </p>
            </div>
          </div>
        </header>

        {/* ▼ プロフィールブロック ▼ */}
        <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-5 bg-blue-600 rounded-full"></div>
            <h3 className="text-lg font-black text-slate-800 tracking-wider uppercase">Profile</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {/* 左カラム */}
            <div className="space-y-4">
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400">身長／体重</span>
                <span className="text-sm font-black text-slate-700">{bodyInfo}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400">生年月日</span>
                <span className="text-sm font-black text-slate-700">{player.birthday || '-'}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400">出身地</span>
                <span className="text-sm font-black text-slate-700">{player.hometown || '-'}</span>
              </div>
            </div>

            {/* 右カラム */}
            <div className="space-y-4">
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400">ドラフト</span>
                <span className="text-sm font-black text-slate-700">{draftInfo}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400">推定年俸</span>
                <span className="text-sm font-black text-slate-700">{player.salary_estimated || '-'}</span>
              </div>
              <div className="flex items-baseline border-b border-slate-100 pb-2">
                <span className="w-24 text-[11px] font-bold text-slate-400">血液型</span>
                <span className="text-sm font-black text-slate-700">{player.blood_type ? `${player.blood_type}型` : '-'}</span>
              </div>
            </div>

            {/* 経歴（全幅を使う） */}
            <div className="md:col-span-2 flex items-baseline border-b border-slate-100 pb-2 mt-2">
              <span className="w-24 text-[11px] font-bold text-slate-400 shrink-0">経歴</span>
              <span className="text-sm font-black text-slate-700">{careerHistory}</span>
            </div>
          </div>

          {/* 寸評（スカウティングレポート）がある場合のみ表示 */}
          {player.raw_scouting_report && (
            <div className="mt-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-600 leading-relaxed">
                {player.raw_scouting_report}
              </p>
            </div>
          )}
        </div>
        {/* ▲ プロフィールブロック ▲ */}

        <div className="bg-white rounded-[2rem] p-6 shadow-xl border-4 border-slate-100 mb-8 text-black">
          <h3 className="text-blue-600 font-black text-xs uppercase border-b-2 border-blue-100 pb-2 mb-4">本塁打・OPSトレンド</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="年度" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" fontSize={10} axisLine={false} tickLine={false} />
                <ChartTooltip />
                <Line yAxisId="left" type="monotone" dataKey="本塁打" stroke="#ef4444" strokeWidth={4} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="OPS" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <section className="mb-20 space-y-12">
          <div>
            <div className="flex justify-between items-center mb-6 px-2">
              <h2 className="text-xl font-black italic border-l-8 border-green-600 pl-4 text-slate-900 uppercase">Batting Data</h2>
              <div className="flex bg-slate-200 p-1 rounded-xl w-32 shadow-inner">
                <button onClick={() => setBTab('basic')} className={tabBtn(bTab === 'basic')}>基本</button>
                <button onClick={() => setBTab('saber')} className={tabBtn(bTab === 'saber')}>分析</button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[2rem] border-4 border-slate-100 shadow-2xl bg-white text-black">
              <table className="w-full text-xs text-left border-separate border-spacing-0">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                  <tr>
                    <th className="sticky left-0 z-30 bg-slate-50 p-4 border-b">年度</th>
                    <th className="p-4 border-b">球団</th>
                    {bTab === 'basic' ? (
                      <><th className="p-4 border-b text-right">打率</th><th className="p-4 border-b text-right">安打</th><th className="p-4 border-b text-right">本塁打</th><th className="p-4 border-b text-right">打点</th><th className="p-4 border-b text-right">OPS</th></>
                    ) : (
                      <><th className="p-4 border-b text-right">WAR</th><th className="p-4 border-b text-right">wOBA</th><th className="p-4 border-b text-right italic">wRC+</th><th className="p-4 border-b text-right">ISOp</th></>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900">
                  {mergedStats.filter(s => s.hasBatting).map((row, i) => {
                    const s = calcSaber(row, 'B') as any;
                    const isH = (key: string, val: any) => i !== 0 && toF(val) >= (careerHighs[key] || 999);
                    return (
                      <tr key={i} className={i === 0 ? "bg-blue-50/50" : ""}>
                        <td className="sticky left-0 z-20 bg-white p-4 font-black border-r">{row.年度}</td>
                        <td className="p-4 text-slate-400 font-black">{row.所属球団}</td>
                        {bTab === 'basic' ? (
                          <>
                            <td className="p-4 text-right font-mono">{dotFormat(row.打率)}</td>
                            <td className={`p-4 text-right font-mono ${isH('安打', row.安打) ? 'text-red-600 font-black' : ''}`}>{row.安打}</td>
                            <td className={`p-4 text-right font-mono ${isH('本塁打', row.本塁打) ? 'text-red-600 font-black' : ''}`}>{row.本塁打}</td>
                            <td className={`p-4 text-right font-mono ${isH('打点', row.打点) ? 'text-red-600 font-black' : ''}`}>{row.打点}</td>
                            <td className="p-4 text-right font-black">{dotFormat(s.ops)}</td>
                          </>
                        ) : (
                          <><td className="p-4 text-right font-black text-blue-600">{s.war}</td><td className="p-4 text-right font-mono">{dotFormat(s.woba)}</td><td className="p-4 text-right font-black italic">{s.wrcPlus}</td><td className="p-4 text-right font-mono">{dotFormat(s.iso)}</td></>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {mergedStats.some(s => s.hasPitching) && (
            <div>
              <div className="flex justify-between items-center mb-6 px-2">
                <h2 className="text-xl font-black italic border-l-8 border-blue-600 pl-4 text-slate-900 uppercase">Pitching Data</h2>
                <div className="flex bg-slate-200 p-1 rounded-xl w-32 shadow-inner">
                  <button onClick={() => setPTab('basic')} className={tabBtn(pTab === 'basic')}>基本</button>
                  <button onClick={() => setPTab('saber')} className={tabBtn(pTab === 'saber')}>分析</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border-4 border-slate-100 shadow-2xl bg-white text-black">
                <table className="w-full text-xs text-left border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                    <tr>
                      <th className="sticky left-0 z-30 bg-slate-50 p-4 border-b">年度</th>
                      <th className="p-4 border-b">球団</th>
                      {pTab === 'basic' ? (
                        <><th className="p-4 border-b text-right">防御率</th><th className="p-4 border-b text-right">勝利</th><th className="p-4 border-b text-right">投球回</th><th className="p-4 border-b text-right">奪三振</th></>
                      ) : (
                        <><th className="p-4 border-b text-right">WAR</th><th className="p-4 border-b text-right">FIP</th><th className="p-4 border-b text-right">K/9</th><th className="p-4 border-b text-right">BB/9</th></>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-900">
                    {mergedStats.filter(s => s.hasPitching).map((row, i) => {
                      const s = calcSaber(row, 'P') as any;
                      const ip = formatIP(row.投球回);
                      return (
                        <tr key={i} className={i === 0 ? "bg-blue-50/50" : ""}>
                          <td className="sticky left-0 z-20 bg-white p-4 font-black border-r">{row.年度}</td>
                          <td className="p-4 text-slate-400 font-black">{row.所属球団}</td>
                          {pTab === 'basic' ? (
                            <><td className="p-4 text-right font-black text-red-600">{toF(row.防御率).toFixed(2)}</td><td className="p-4 text-right font-black">{row.勝利}</td><td className="p-4 text-right">{row.投球回}</td><td className="p-4 text-right">{row.三振}</td></>
                          ) : (
                            <><td className="p-4 text-right font-black text-blue-600">{s.war}</td><td className="p-4 text-right font-mono">{s.fip}</td><td className="p-4 text-right">{(toF(row.三振)*9/ip).toFixed(2)}</td><td className="p-4 text-right">{(toF(row.四球)*9/ip).toFixed(2)}</td></>
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
      <footer className="mt-20 text-center text-gray-400 text-[10px] font-black uppercase pb-12 italic">© 2026 POWERFUL NPB ANALYTICS</footer>
    </main>
  );
}