'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

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

// --- バッジスタイル ---
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

  const toF = (val: any) => parseFloat(val) || 0;
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

        const cleanName = p.player_name.replace(/\s+/g, '');
        const [allP, allB] = await Promise.all([
          supabase.from('pitching_stats').select('*').or(`player_id.eq.${id},名前.eq.${p.player_name},名前.eq.${cleanName}`),
          supabase.from('batting_stats').select('*').or(`player_id.eq.${id},名前.eq.${p.player_name},名前.eq.${cleanName}`)
        ]);

        const myP = (allP.data || []).sort((a, b) => b.年度 - a.年度);
        const myB = (allB.data || []).sort((a, b) => b.年度 - a.年度);
        setPitching(myP);
        setBatting(myB);

        const years = Array.from(new Set([...myP.map(s => s.年度), ...myB.map(s => s.年度)]));
        if (years.length === 0) { setLoading(false); return; }

        const [{ data: lgB }, { data: lgP }] = await Promise.all([
          supabase.from('batting_stats').select('*').in('年度', years),
          supabase.from('pitching_stats').select('*').in('年度', years)
        ]);

        const statsByYear: Record<string, any> = {};
        years.forEach(year => {
          const yearB = lgB?.filter(r => r.年度 === year) || [];
          const yearP = lgP?.filter(r => r.年度 === year) || [];
          const sumPA = yearB.reduce((acc, r) => acc + toF(r.打席), 0) || 1;
          const sumIP = yearP.reduce((acc, r) => acc + formatIP(r.投球回), 0) || 1;
          const sumER = yearP.reduce((acc, r) => acc + toF(r.自責点), 0);
          const lgERA = (sumER * 9) / sumIP;
          const rawFIP = (13 * yearP.reduce((acc, r) => acc + toF(r.本塁打), 0) + 3 * (yearP.reduce((acc, r) => acc + toF(r.四球), 0) + yearP.reduce((acc, r) => acc + toF(r.死球), 0)) - 2 * yearP.reduce((acc, r) => acc + toF(r.三振), 0)) / sumIP;
          statsByYear[year] = { 
            lgwOBA: (0.7 * yearB.reduce((acc, r) => acc + toF(r.四球), 0) + 0.72 * yearB.reduce((acc, r) => acc + toF(r.死球), 0) + 0.9 * (yearB.reduce((acc, r) => acc + toF(r.安打), 0) - yearB.reduce((acc, r) => acc + (toF(r.二塁打)+toF(r.三塁打)+toF(r.本塁打)), 0)) + 1.25 * yearB.reduce((acc, r) => acc + toF(r.二塁打), 0) + 1.6 * yearB.reduce((acc, r) => acc + toF(r.三塁打), 0) + 2.0 * yearB.reduce((acc, r) => acc + toF(r.本塁打), 0)) / sumPA, 
            lgFIP_C: lgERA - rawFIP, 
            lgR_PA: yearB.reduce((acc, r) => acc + toF(r.得点), 0) / sumPA, 
            lgERA 
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
    if (!yearData) return { fip: '-', war: '-', woba: 0, wrcPlus: 0, iso: 0 };
    if (type === 'P') {
      const ip = formatIP(row.投球回);
      const fipVal = ip === 0 ? 9 : (13 * toF(row.本塁打) + 3 * (toF(row.四球) + toF(row.死球)) - 2 * toF(row.三振)) / ip + yearData.lgFIP_C;
      const warVal = ((yearData.lgERA - fipVal) / 10 + 0.12) * (ip / 9);
      return { fip: fipVal.toFixed(2), war: warVal.toFixed(1), fipVal, warVal };
    } else {
      const pa = toF(row.打席);
      if (pa === 0) return { woba: 0, wrcPlus: 0, war: '0.0', iso: 0 };
      const wobaVal = (0.7 * toF(row.四球) + 0.72 * toF(row.死球) + 0.9 * (toF(row.安打)-(toF(row.二塁打)+toF(row.三塁打)+toF(row.本塁打))) + 1.25 * toF(row.二塁打) + 1.6 * toF(row.三塁打) + 2.0 * toF(row.本塁打)) / pa;
      const wrcPlusVal = Math.round((( (wobaVal - yearData.lgwOBA) / 1.24 + yearData.lgR_PA) / yearData.lgR_PA) * 100);
      const warVal = (((wobaVal - yearData.lgwOBA) / 1.24) * pa + (POSITION_ADJUSTMENT[player.position_detail] || 0) * (pa / 600) + (17.5 * pa / 600)) / 10;
      return { woba: wobaVal, wrcPlus: wrcPlusVal, war: warVal.toFixed(1), iso: toF(row.長打率)-toF(row.打率), wrcPlusVal, warVal };
    }
  };

  // --- アバター・ポーズ・球団判定ロジック ---
  const isPitcher = player.position_detail === '投手';
  const throwsBatsStr = player.throws_bats || '';
  const throws = (throwsBatsStr.includes('左投') ? 'left' : 'right') as 'left' | 'right';
  const bats = (
    throwsBatsStr.includes('両打') ? 'both' : 
    throwsBatsStr.includes('左打') ? 'left' : 'right'
  ) as 'right' | 'left' | 'both';

  const getInitialByTeamName = (teamName: string): string => {
    if (teamName.includes('阪神') || teamName.includes('タイガース')) return 'T';
    if (teamName.includes('巨人') || teamName.includes('ジャイアンツ')) return 'G';
    if (teamName.includes('中日') || teamName.includes('ドラゴンズ')) return 'D';
    if (teamName.includes('ＤｅＮＡ') || teamName.includes('ベイスターズ')) return 'YB';
    if (teamName.includes('広島') || teamName.includes('カープ')) return 'C';
    if (teamName.includes('ヤクルト') || teamName.includes('スワローズ')) return 'S';
    if (teamName.includes('ソフトバンク') || teamName.includes('ホークス')) return 'H';
    if (teamName.includes('西武') || teamName.includes('ライオンズ')) return 'L';
    if (teamName.includes('ロッテ') || teamName.includes('マリーンズ')) return 'M';
    if (teamName.includes('オリックス') || teamName.includes('バファローズ')) return 'B';
    if (teamName.includes('楽天') || teamName.includes('イーグルス')) return 'E';
    if (teamName.includes('日本ハム') || teamName.includes('ファイターズ')) return 'F';
    return 'P';
  };

  const teamInitial = getInitialByTeamName(player.team_name);
  let pose = isPitcher ? `pitcher_${throws}` : `batter_${bats}`;
  const selectedAvatarPath = `/images/avatars/${teamInitial}_${pose}.png`;

  const latestP = pitching[0];
  const latestB = batting[0];
  const pSaber = latestP ? calcSaber(latestP, 'P') : ({} as any);
  const bSaber = latestB ? calcSaber(latestB, 'B') : ({} as any);
  const totalWar = isPitcher ? toF(pSaber.warVal) : toF(bSaber.warVal);
  const totalRank = isPitcher ? getRank(totalWar, 'WAR') : getRank(bSaber.wrcPlusVal, 'wRC+');

  const stickyYearHeader = "sticky left-0 z-30 bg-gray-200 min-w-[60px] shadow-[1px_0_0_0_#ccc]";
  const stickyYearCell = "sticky left-0 z-10 bg-white min-w-[60px] shadow-[1px_0_0_0_#eee]";
  const stickyTeamHeader = "sticky left-[60px] z-30 bg-gray-200 min-w-[80px] shadow-[1px_0_0_0_#ccc]";
  const stickyTeamCell = "sticky left-[60px] z-10 bg-white min-w-[80px] shadow-[1px_0_0_0_#eee]";
  const tabBtn = (active: boolean) => `flex-1 py-3 text-sm font-black transition-all rounded-full ${active ? 'bg-blue-500 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`;

  return (
    <main className="min-h-screen bg-gray-100 p-2 md:p-10 text-gray-800 font-sans tracking-tight">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-blue-600 font-black mb-4 inline-block px-2">← メニューへ戻る</Link>
        
        {/* --- ヘッダーカード --- */}
        <header className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-blue-500 mb-8 p-6 md:p-8">
          <div className="flex justify-between items-start gap-4 mb-8">
            <div className="flex flex-col flex-1">
              {/* 選手アバター */}
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-blue-200 flex items-center justify-center overflow-hidden shadow-inner mb-4 bg-white">
                <img
                  src={selectedAvatarPath}
                  alt={`${player.player_name}のアバター`}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = "/images/avatars/default.png"; }}
                />
              </div>
              <p className="text-blue-500 font-black text-xs md:text-sm mb-1">{player.team_name}</p>
              <h1 className="text-3xl md:text-5xl font-black text-blue-900 leading-none tracking-tighter mb-4 italic whitespace-pre-wrap">{player.player_name}</h1>
              <div className="flex gap-2">
                <span className="bg-yellow-400 text-blue-900 text-[10px] md:text-xs font-black px-3 py-1 rounded-full shadow-sm">{player.position_detail}</span>
                <span className="bg-gray-200 text-gray-700 text-[10px] md:text-xs font-black px-3 py-1 rounded-full">{player.throws_bats}</span>
              </div>
            </div>

            {/* 総合評価ボックス */}
            <div className="flex flex-col items-center w-28 md:w-36 flex-shrink-0">
              <span className="bg-blue-600 text-white text-[10px] md:text-xs font-black px-4 py-1.5 rounded-t-xl w-full text-center">総合評価</span>
              <div className="bg-blue-50 w-full flex flex-col items-center justify-center py-4 md:py-6 rounded-b-xl border-2 border-blue-600 shadow-inner">
                <span className="text-6xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-b from-yellow-400 to-orange-600 drop-shadow-md leading-none">{totalRank}</span>
                <div className="mt-2 md:mt-4 text-center">
                  <p className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase">貢献度 (WAR)</p>
                  <p className="text-3xl md:text-4xl font-black text-blue-900 tracking-tighter">{totalWar.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 重要指標 2x2 パネル */}
          <div className="grid grid-cols-2 gap-3 md:gap-4 mt-4">
            {isPitcher ? (
              <>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-gray-100 flex flex-col items-center text-center">
                  <span className="text-[9px] md:text-xs font-black text-gray-400 mb-2">FIP評価 (守備力除外)</span>
                  <div className={rankBadge(getRank(pSaber.fipVal, 'FIP'))}>{getRank(pSaber.fipVal, 'FIP')}</div>
                  <p className="text-blue-900 text-2xl md:text-3xl font-black mt-2">{pSaber.fip}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-gray-100 flex flex-col items-center text-center">
                  <span className="text-[9px] md:text-xs font-black text-gray-400 mb-2">制球力 (K/BB)</span>
                  <div className={rankBadge('S')}>STABLE</div>
                  <p className="text-blue-900 text-2xl md:text-3xl font-black mt-2">{(toF(latestP?.三振)/toF(latestP?.四球) || 0).toFixed(1)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-gray-100 flex flex-col items-center text-center">
                  <span className="text-[9px] md:text-xs font-black text-gray-400 mb-2">打撃指標 (wRC+)</span>
                  <div className={rankBadge(getRank(bSaber.wrcPlusVal, 'wRC+'))}>{getRank(bSaber.wrcPlusVal, 'wRC+')}</div>
                  <p className="text-green-800 text-2xl md:text-3xl font-black mt-2">{bSaber.wrcPlus}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-gray-100 flex flex-col items-center text-center">
                  <span className="text-[9px] md:text-xs font-black text-gray-400 mb-2">総合力 (OPS)</span>
                  <div className={rankBadge('S')}>STATUS</div>
                  <p className="text-green-800 text-2xl md:text-3xl font-black mt-2">{dotFormat(toF(latestB?.出塁率)+toF(latestB?.長打率))}</p>
                </div>
              </>
            )}
          </div>
        </header>

        {/* --- プロフィール・経歴セクション --- */}
        <div className="bg-white rounded-[2rem] p-6 md:p-10 shadow-xl border-4 border-gray-200 mb-8">
          <div className="grid grid-cols-2 gap-x-6 md:gap-x-12 gap-y-8 mb-8">
            <div className="space-y-4">
              <h3 className="text-blue-600 font-black text-[10px] md:text-xs uppercase border-b-2 border-blue-100 pb-2">プロフィール</h3>
              <div className="space-y-3 text-sm md:text-base font-black">
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">生年月日</span>{player.birthday}</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">身長/体重</span>{player.height}cm / {player.weight}kg</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">出身地</span>{player.hometown}</p>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-green-600 font-black text-[10px] md:text-xs uppercase border-b-2 border-green-100 pb-2">経歴</h3>
              <div className="space-y-3 text-sm md:text-base font-black">
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">高校</span>{player.high_school}</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">大学</span>{player.university || "---"}</p>
                <p className="flex flex-col"><span className="text-gray-400 text-[10px] font-bold">社会人・他</span><span className="leading-tight">{[player.prev_team_1, player.prev_team_2].filter(t => t).join(' → ') || "---"}</span></p>
              </div>
            </div>
          </div>

          {/* ドラフト結果（サイズ調整版） */}
          <div className="bg-blue-600 p-4 md:p-6 rounded-2xl shadow-inner text-white flex justify-between items-center overflow-hidden">
            <div>
              <p className="text-[9px] md:text-[10px] font-black opacity-80 uppercase tracking-widest">Draft Result</p>
              <p className="text-xl md:text-2xl font-black italic tracking-tighter">{player.draft_year}年 入団</p>
            </div>
            <div className="text-right">
              <p className="text-2xl md:text-4xl font-black italic underline decoration-yellow-400 underline-offset-4">{player.draft_rank}位</p>
            </div>
          </div>
        </div>

        {/* --- 成績テーブルセクション --- */}
        <section className="space-y-12 mb-20">
          {pitching.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-5 px-1">
                <h2 className="text-lg md:text-xl font-black italic border-l-8 border-red-600 pl-4">PITCHING</h2>
                <div className="flex bg-gray-200 p-1 rounded-2xl w-36 shadow-inner overflow-hidden">
                  <button onClick={() => setPTab('basic')} className={tabBtn(pTab === 'basic')}>基本</button>
                  <button onClick={() => setPTab('saber')} className={tabBtn(pTab === 'saber')}>分析</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border-4 border-gray-200 shadow-2xl bg-white relative">
                <table className="w-full text-[11px] md:text-xs text-left whitespace-nowrap border-separate border-spacing-0">
                  <thead className="bg-gray-100 text-gray-500 font-black uppercase tracking-tighter">
                    <tr>
                      <th className={stickyYearHeader + " p-4 border-b"}>年度</th>
                      <th className={stickyTeamHeader + " p-4 border-b"}>球団</th>
                      {pTab === 'basic' ? (
                        <>
                          <th className="p-4 border-b text-right text-blue-600">防御率</th><th className="p-4 border-b text-right">登板</th>
                          <th className="p-4 border-b text-right">勝利</th><th className="p-4 border-b text-right">敗戦</th>
                          <th className="p-4 border-b text-right">セーブ</th><th className="p-4 border-b text-right">ホールド</th>
                          <th className="p-4 border-b text-right">HP</th><th className="p-4 border-b text-right font-black">投球回</th>
                          <th className="p-4 border-b text-right font-black">三振</th><th className="p-4 border-b text-right">自責点</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4 border-b text-right text-red-600 font-black">WAR</th><th className="p-4 border-b text-right font-bold">FIP</th>
                          <th className="p-4 border-b text-right">WHIP</th><th className="p-4 border-b text-right text-blue-600">K/BB</th>
                          <th className="p-4 border-b text-right">K/9</th><th className="p-4 border-b text-right">BB/9</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pitching.map((row, i) => {
                      const s = calcSaber(row, 'P') as any;
                      return (
                        <tr key={i} className="hover:bg-blue-50 transition-colors">
                          <td className={stickyYearCell + " p-4 font-black"}>{row.年度}</td>
                          <td className={stickyTeamCell + " p-4 font-black text-gray-400"}>{row.所属球団}</td>
                          {pTab === 'basic' ? (
                            <>
                              <td className="p-4 text-right font-mono font-black text-blue-600">{(toF(row.防御率)).toFixed(2)}</td>
                              <td className="p-4 text-right">{row.登板}</td>
                              <td className="p-4 text-right font-bold text-gray-800">{row.勝利}</td>
                              <td className="p-4 text-right">{row.敗戦}</td>
                              <td className="p-4 text-right">{row.セーブ}</td>
                              <td className="p-4 text-right">{row.ホールド}</td>
                              <td className="p-4 text-right">{row.HP}</td>
                              <td className="p-4 text-right font-bold">{row.投球回}</td>
                              <td className="p-4 text-right font-black">{row.三振}</td>
                              <td className="p-4 text-right font-bold text-gray-800">{row.自責点}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-4 text-right font-mono font-black text-red-600">{s.war}</td>
                              <td className="p-4 text-right font-mono font-bold text-slate-700">{s.fip}</td>
                              <td className="p-4 text-right font-mono text-slate-700">{formatIP(row.投球回) === 0 ? '.00' : ((toF(row.安打)+toF(row.四球))/formatIP(row.投球回)).toFixed(2)}</td>
                              <td className="p-4 text-right font-mono">{(toF(row.三振)/toF(row.四球) || 0).toFixed(2)}</td>
                              <td className="p-4 text-right font-mono">{(toF(row.三振)*9/formatIP(row.投球回)).toFixed(2)}</td>
                              <td className="p-4 text-right font-mono">{((toF(row.四球)+toF(row.死球))*9/formatIP(row.投球回)).toFixed(2)}</td>
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

          {batting.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-5 px-1">
                <h2 className="text-lg md:text-xl font-black italic border-l-8 border-green-600 pl-4">BATTING</h2>
                <div className="flex bg-gray-200 p-1 rounded-2xl w-36 shadow-inner overflow-hidden">
                  <button onClick={() => setBTab('basic')} className={tabBtn(bTab === 'basic')}>基本</button>
                  <button onClick={() => setBTab('saber')} className={tabBtn(bTab === 'saber')}>分析</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[2rem] border-4 border-gray-200 shadow-2xl bg-white relative">
                <table className="w-full text-[11px] md:text-xs text-left whitespace-nowrap border-separate border-spacing-0">
                  <thead className="bg-gray-100 text-gray-500 font-black uppercase tracking-tighter">
                    <tr>
                      <th className={stickyYearHeader + " p-4 border-b"}>年度</th>
                      <th className={stickyTeamHeader + " p-4 border-b"}>球団</th>
                      {bTab === 'basic' ? (
                        <>
                          <th className="p-4 border-b text-right text-blue-600">打率</th><th className="p-4 border-b text-right">試合</th>
                          <th className="p-4 border-b text-right">打席</th><th className="p-4 border-b text-right font-bold">安打</th>
                          <th className="p-4 border-b text-right font-black text-red-600">本塁打</th><th className="p-4 border-b text-right font-black">打点</th>
                          <th className="p-4 border-b text-right font-bold text-green-600">盗塁</th><th className="p-4 border-b text-right font-bold text-gray-700">出塁率</th>
                          <th className="p-4 border-b text-right font-bold text-gray-700">長打率</th>
                        </>
                      ) : (
                        <>
                          <th className="p-4 border-b text-right text-green-700 font-black">WAR</th><th className="p-4 border-b text-right font-bold">wOBA</th>
                          <th className="p-4 border-b text-right font-black italic">wRC+</th><th className="p-4 border-b text-right font-black">OPS</th>
                          <th className="p-4 border-b text-right text-slate-500">ISOp</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {batting.map((row, i) => {
                      const s = calcSaber(row, 'B') as any;
                      return (
                        <tr key={i} className="hover:bg-green-50 transition-colors">
                          <td className={stickyYearCell + " p-4 font-black"}>{row.年度}</td>
                          <td className={stickyTeamCell + " p-4 font-black text-gray-400"}>{row.所属球団}</td>
                          {bTab === 'basic' ? (
                            <>
                              <td className="p-4 text-right font-mono font-black text-blue-600">{dotFormat(row.打率)}</td>
                              <td className="p-4 text-right">{row.試合}</td><td className="p-4 text-right">{row.打席}</td>
                              <td className="p-4 text-right font-bold">{row.安打}</td>
                              <td className="p-4 text-right font-black text-red-600">{row.本塁打}</td>
                              <td className="p-4 text-right font-black">{row.打点}</td>
                              <td className="p-4 text-right font-bold text-green-600">{row.盗塁}</td>
                              <td className="p-4 text-right font-mono font-bold text-gray-700">{dotFormat(row.出塁率)}</td>
                              <td className="p-4 text-right font-mono font-bold text-gray-700">{dotFormat(row.長打率)}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-4 text-right font-mono font-black text-green-700">{s.war}</td>
                              <td className="p-4 text-right font-mono font-bold text-slate-700">{dotFormat(s.woba)}</td>
                              <td className="p-4 text-right font-mono font-black text-slate-800">{s.wrcPlus}</td>
                              <td className="p-4 text-right font-mono font-black">{(toF(row.出塁率)+toF(row.長打率)).toFixed(3)}</td>
                              <td className="p-4 text-right font-mono text-slate-500">{dotFormat(s.iso)}</td>
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
      <footer className="mt-20 text-center text-gray-400 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">© 2026 POWERFUL NPB ANALYTICS</footer>
    </main>
  );
}