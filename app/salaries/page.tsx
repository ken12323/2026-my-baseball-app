'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ==========================================
// 0. 定数定義・リーグ仕分けマッピング
// ==========================================
const TEAM_LEAGUE_MAP: Record<string, 'central' | 'pacific' | 'farm'> = {
  '巨人': 'central', '読売': 'central', 'ジャイアンツ': 'central',
  'ヤクルト': 'central', '東京ヤクルト': 'central', 'スワローズ': 'central',
  '横浜': 'central', 'DeNA': 'central', '横浜DeNA': 'central', 'ベイスターズ': 'central',
  '中日': 'central', 'ドラゴンズ': 'central',
  '阪神': 'central', 'タイガース': 'central',
  '広島': 'central', '広島東洋': 'central', 'カープ': 'central',
  '西武': 'pacific', '埼玉西武': 'pacific', 'ライオンズ': 'pacific',
  '日ハム': 'pacific', '日本ハム': 'pacific', '北海道日本ハム': 'pacific', 'ファイターズ': 'pacific',
  '千葉': 'pacific', 'ロッテ': 'pacific', '千葉ロッテ': 'pacific', 'マリーンズ': 'pacific',
  'オリックス': 'pacific', 'バファローズ': 'pacific',
  'ソフトバンク': 'pacific', '福岡ソフトバンク': 'pacific', 'ホークス': 'pacific',
  '楽天': 'pacific', '東北楽天': 'pacific', 'ゴールデンイーグルス': 'pacific',
  'オイシックス': 'farm', 'くふうハヤテ': 'farm', 'ハヤテ': 'farm'
};

const ALL_TEAMS_LIST = [
  { name: '巨人', league: 'central' }, { name: 'ヤクルト', league: 'central' },
  { name: '横浜DeNA', league: 'central' }, { name: '中日', league: 'central' },
  { name: '阪神', league: 'central' }, { name: '広島', league: 'central' },
  { name: '埼玉西武', league: 'pacific' }, { name: '北海道日本ハム', league: 'pacific' },
  { name: '千葉ロッテ', league: 'pacific' }, { name: 'オリックス', league: 'pacific' },
  { name: '福岡ソフトバンク', league: 'pacific' }, { name: '東北楽天', league: 'pacific' },
  { name: 'オイシックス', league: 'farm' }, { name: 'くふうハヤテ', league: 'farm' }
];

const YEARS_ARRAY = Array.from({ length: 2026 - 2013 + 1 }, (_, i) => 2026 - i);

// 💡 12球団公式イメージカラー動的適用バッジ背景定義（一部カラー変更適用済）
const getTeamColorClass = (teamName: string): string => {
  const clean = teamName || '';
  if (clean.includes('巨人') || clean.includes('読売') || clean.includes('ジャイアンツ')) return 'bg-orange-500 text-white border-orange-600';
  if (clean.includes('阪神') || clean.includes('タイガース')) return 'bg-yellow-400 text-black border-yellow-500';
  if (clean.includes('中日') || clean.includes('ドラゴンズ')) return 'bg-blue-600 text-white border-blue-700';
  if (clean.includes('DeNA') || clean.includes('横浜') || clean.includes('ベイスターズ')) return 'bg-sky-500 text-white border-sky-600';
  // 🟢 ヤクルト ➔ 黄緑色のボックスに黒文字カスタム
  if (clean.includes('ヤクルト') || clean.includes('スワローズ')) return 'bg-lime-500 text-black border-lime-600';
  if (clean.includes('広島') || clean.includes('カープ')) return 'bg-red-600 text-white border-red-700';
  if (clean.includes('ソフトバンク') || clean.includes('ホークス')) return 'bg-amber-400 text-black border-amber-500';
  if (clean.includes('ロッテ') || clean.includes('マリーンズ')) return 'bg-zinc-700 text-white border-zinc-800';
  // 🔵 オリックス ➔ ネイビーボックスに金文字カスタム
  if (clean.includes('オリックス') || clean.includes('バファローズ')) return 'bg-blue-950 text-amber-400 border-amber-600';
  if (clean.includes('日本ハム') || clean.includes('日ハム') || clean.includes('ファイターズ')) return 'bg-cyan-600 text-white border-cyan-700';
  if (clean.includes('西武') || clean.includes('ライオンズ')) return 'bg-indigo-900 text-white border-indigo-950';
  if (clean.includes('楽天') || clean.includes('ゴールデンイーグルス')) return 'bg-rose-800 text-white border-rose-900';
  if (clean.includes('オイシックス') || clean.includes('ハヤテ') || clean.includes('くふうハヤテ')) return 'bg-emerald-600 text-white border-emerald-700';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

// ==========================================
// 1. 共通フォーマット関数 (仕様書ルール厳守)
// ==========================================
const toF = (val: any): number => {
  const f = parseFloat(val);
  return isNaN(f) ? 0 : f;
};

const dotFormat = (val: any) => {
  const s = toF(val).toFixed(3);
  return s.startsWith('0.') ? s.substring(1) : s.startsWith('-0.') ? '-' + s.substring(2) : s;
};

const formatSalaryLabel = (value: number): string => {
  if (value >= 100000000) {
    const oku = Math.floor(value / 100000000);
    const man = Math.floor((value % 100000000) / 10000);
    return man > 0 ? `${oku}億${man}万円` : `${oku}億円`;
  }
  return `${Math.floor(value / 10000)}万円`;
};

// ==========================================
// 2. コア・ランキング集計コンテンツ
// ==========================================
function SalariesRankingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URLパラメータからの状態復元
  const yearParam = searchParams.get('year') || '2026';
  const leagueParam = searchParams.get('league') || 'all';
  const teamParam = searchParams.get('team') || 'all';
  const roleParam = searchParams.get('role') || 'all';

  const [rankingData, setRankingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryStats, setSummaryStats] = useState({ total: 0, avg: 0, count: 0 });

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' && key !== 'year') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    if (key === 'team' && value !== 'all') {
      const target = ALL_TEAMS_LIST.find(t => value.includes(t.name) || t.name.includes(value));
      if (target) params.set('league', target.league);
    }
    if (key === 'league') {
      params.delete('team');
    }
    router.push(`/salaries?${params.toString()}`);
  };

  useEffect(() => {
    async function loadRankings() {
      try {
        setLoading(true);

        const masterList: any[] = [];
        const pageSize = 1000;

        // ページネーションのクエリすき間によるレコード抜け落ちを防ぐため、厳密なorderソート順を完全固定
        // 1. 1軍マスター全件ロード
        let start = 0;
        while (true) {
          const { data, error } = await supabase
            .from('players')
            .select('*')
            .order('player_id', { ascending: true })
            .range(start, start + pageSize - 1);
          if (error || !data || data.length === 0) break;
          masterList.push(...data);
          if (data.length < pageSize) break;
          start += pageSize;
        }

        // 2. 2軍マスター全件ロード
        start = 0;
        while (true) {
          const { data, error } = await supabase
            .from('farm_players')
            .select('*')
            .order('player_id', { ascending: true })
            .range(start, start + pageSize - 1);
          if (error || !data || data.length === 0) break;
          masterList.push(...data);
          if (data.length < pageSize) break;
          start += pageSize;
        }
        
        // ID引き当て用高速一本釣りマップ成形
        const masterIdMap = new Map();
        masterList.forEach(p => {
          if (!p.player_id) return;
          const cleanId = String(p.player_id).trim().padStart(8, '0');
          masterIdMap.set(cleanId, p);
        });

        // 記号剥離クレンジング関数
        const cleanNameKey = (name: string) => {
          return (name || '')
            .replace(/[\s ]+/g, '')
            .replace(/[A-Za-zＡ-Ｚａ-ｚ０-９\d．\.\/・\-\s_]/g, '')
            .replace(/ジュニア|Jr\./g, '');
        };

        // ② 推定年俸ベースデータの取得（金額順トップ1000）
        let salaryQuery = supabase.from('player_salaries')
          .select('*')
          .order('salary', { ascending: false })
          .limit(1000);

        if (yearParam !== 'all') {
          salaryQuery = salaryQuery.eq('year', Number(yearParam));
        }
        const { data: salaryData } = await salaryQuery;

        const salaryRecords = salaryData || [];
        const targetPlayerIds = Array.from(new Set(salaryRecords.map(s => String(s.player_id).padStart(8, '0'))));
        const targetYears = Array.from(new Set(salaryRecords.map(s => Number(s.year))));

        // ③ 各年度の成績スタッツを一括回収
        let bData: any[] = [];
        let pData: any[] = [];

        if (targetPlayerIds.length > 0 && targetYears.length > 0) {
          const [b1, b2, p1, p2] = await Promise.all([
            supabase.from('batting_stats').select('*').in('player_id', targetPlayerIds).in('年度', targetYears).limit(5000),
            supabase.from('farm_batting_stats').select('*').in('player_id', targetPlayerIds).in('年度', targetYears).limit(5000),
            supabase.from('pitching_stats').select('*').in('player_id', targetPlayerIds).in('年度', targetYears).limit(5000),
            supabase.from('farm_pitching_stats').select('*').in('player_id', targetPlayerIds).in('年度', targetYears).limit(5000)
          ]);
          bData = [...(b1.data || []), ...(b2.data || [])];
          pData = [...(p1.data || []), ...(p2.data || [])];
        }

        const bMap = new Map();
        const pMap = new Map();
        bData.forEach(row => bMap.set(`${String(row.player_id).padStart(8, '0')}_${row.年度}`, row));
        pData.forEach(row => pMap.set(`${String(row.player_id).padStart(8, '0')}_${row.年度}`, row));

        const mergedList: any[] = [];
        let sumSalary = 0;

        const getTeamCoreWord = (tName: string) => {
          const m = tName.match(/ヤクルト|ソフトバンク|巨人|読売|阪神|中日|DeNA|横浜|広島|西武|ロッテ|オリックス|楽天|オイシックス|ハヤテ/);
          return m ? m[0] : tName.substring(0, 2);
        };

        // ④ 結合・マージ処理
        salaryRecords.forEach(sal => {
          const sId = sal.player_id ? String(sal.player_id).trim().padStart(8, '0') : '';
          const sYear = Number(sal.year);
          const rawSalTeam = sal.team_name || '';
          let searchName = sal.player_name ? sal.player_name.trim() : '';

          if (searchName.includes('ドミンゴ') && (rawSalTeam.includes('ヤクルト') || rawSalTeam.includes('スワローズ'))) {
            searchName = 'サンタナ'; 
          }

          const cName = cleanNameKey(searchName);
          const salTeamCore = getTeamCoreWord(rawSalTeam);

          // ID完全一致の「一本釣り」を主軸にしつつ、すれ違い対策に「球団コア×名前部分一致」のセーフティネットを同時配備する鉄壁の2段構え
          let matchedPlayer = masterIdMap.get(sId);

          if (!matchedPlayer && searchName) {
            matchedPlayer = masterList.find(p => {
              const mTeamCore = getTeamCoreWord(p.team_name || '');
              if (mTeamCore !== salTeamCore) return false; // 球団コアが不一致の別人（例：ソフトバンクのオスナとヤクルトのオスナ）を完全ガード

              const cleanMName = cleanNameKey(p.player_name);
              return cleanMName.includes(cName) || cName.includes(cleanMName);
            });
          }

          const finalName = matchedPlayer ? matchedPlayer.player_name : searchName;
          const finalId = matchedPlayer ? String(matchedPlayer.player_id).padStart(8, '0') : sId;
          const finalPos = matchedPlayer ? (matchedPlayer.position_detail || '不明') : '不明';
          const finalTeam = sal.team_name || (matchedPlayer ? matchedPlayer.team_name : '不明');

          let matchedLeague: 'central' | 'pacific' | 'farm' = 'farm';
          for (const [tKey, lg] of Object.entries(TEAM_LEAGUE_MAP)) {
            if (finalTeam.includes(tKey) || tKey.includes(finalTeam)) {
              matchedLeague = lg;
              break;
            }
          }

          const lookupKey = `${finalId}_${sYear}`;
          const statB = bMap.get(lookupKey);
          const statP = pMap.get(lookupKey);

          const isPitcherRole = finalPos.includes('投手') || pMap.has(lookupKey) || (statP !== undefined);
          const currentRole: 'hitter' | 'pitcher' = isPitcherRole ? 'pitcher' : 'hitter';

          // URLパラメータフィルター
          if (leagueParam !== 'all' && matchedLeague !== leagueParam) return;
          if (roleParam !== 'all' && currentRole !== roleParam) return;
          if (teamParam !== 'all') {
            const cleanT = teamParam.replace(/タイガース|ジャイアンツ|ベイスターズ|ドラゴンズ|スワローズ|カープ|ゴールデンイーグルス|マリーンズ|ファイターズ|ライオンズ|バファローズ|ホークス/g, '');
            if (!finalTeam.includes(cleanT) && !cleanT.includes(finalTeam)) return;
          }

          sumSalary += Number(sal.salary || 0);

          mergedList.push({
            ...sal,
            resolvedId: finalId,
            resolvedName: finalName,
            resolvedPos: finalPos,
            resolvedTeam: finalTeam,
            league: matchedLeague,
            role: currentRole,
            statB,
            statP
          });
        });

        const sortedList = mergedList.sort((a, b) => Number(b.salary || 0) - Number(a.salary || 0));
        setRankingData(sortedList);

        setSummaryStats({
          total: sumSalary,
          count: sortedList.length,
          avg: sortedList.length > 0 ? Math.round(sumSalary / sortedList.length) : 0
        });

      } catch (err) {
        console.error('年俸ランキング集計エラー:', err);
      } finally {
        setLoading(false);
      }
    }

    loadRankings();
  }, [yearParam, leagueParam, teamParam, roleParam]);

  return (
    <div className="space-y-6">
      
      {/* 🧭 Aコントロール：フィルターナビゲーション */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4 text-black">
        {/* 年度・歴代切り替え */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-50 pb-3">
          <span className="text-xs font-black text-slate-400 uppercase tracking-wider">📅 対象シーズンスコープ</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => updateParams('year', '2026')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${yearParam === '2026' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
            >
              2026年
            </button>
            <select
              value={yearParam === 'all' || yearParam === '2026' ? '2026' : yearParam}
              onChange={(e) => updateParams('year', e.target.value)}
              className={`px-2 py-1 rounded-lg text-xs font-black border bg-slate-50 text-slate-600 focus:outline-none ${yearParam !== 'all' && yearParam !== '2026' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200'}`}
            >
              {YEARS_ARRAY.filter(y => y !== 2026).map(y => (
                <option key={y} value={String(y)}>{y}年</option>
              ))}
            </select>
            <button
              onClick={() => updateParams('year', 'all')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${yearParam === 'all' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
            >
              👑 歴代最高年俸
            </button>
          </div>
        </div>

        {/* リーグ・守備区分フィルター */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-slate-50 pb-3">
          <div>
            <span className="text-[10px] font-black text-slate-400 block mb-1.5 uppercase">所属リーグ区分</span>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button onClick={() => updateParams('league', 'all')} className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all ${leagueParam === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>全体</button>
              <button onClick={() => updateParams('league', 'central')} className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all ${leagueParam === 'central' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400'}`}>セ・リーグ</button>
              <button onClick={() => updateParams('league', 'pacific')} className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all ${leagueParam === 'pacific' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>パ・リーグ</button>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 block mb-1.5 uppercase">投手・野手区分</span>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button onClick={() => updateParams('role', 'all')} className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all ${roleParam === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>全ポジション</button>
              <button onClick={() => updateParams('role', 'hitter')} className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all ${roleParam === 'hitter' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400'}`}>🏏 野手限定</button>
              <button onClick={() => updateParams('role', 'pitcher')} className={`flex-1 py-1.5 rounded-lg font-black text-xs transition-all ${roleParam === 'pitcher' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-400'}`}>👑 投手限定</button>
            </div>
          </div>
        </div>

        {/* 12球団ピンポイントセレクト */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-black text-slate-400 shrink-0 uppercase">球団絞り込み:</span>
          <select
            value={teamParam}
            onChange={(e) => updateParams('team', e.target.value)}
            className="flex-1 max-w-xs bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">すべての球団 (12球団＋ファーム)</option>
            {ALL_TEAMS_LIST.map(t => (
              <option key={t.name} value={t.name}>
                {t.league === 'central' ? '🔴 ' : t.league === 'pacific' ? '🔵 ' : '🟢 '} {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 📊 Bサマリー：スコープサマリーカード */}
      <div className="grid grid-cols-3 gap-3 text-center text-black">
        <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
          <span className="text-[9px] font-black text-slate-400 block mb-0.5 uppercase">該当者数</span>
          <p className="text-xl font-black text-slate-800 tracking-tight">{summaryStats.count}<span className="text-xs font-bold text-slate-400 ml-0.5">名</span></p>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[9px] font-black text-slate-400 block mb-0.5 uppercase">平均推定年俸</span>
          <p className="text-xl font-black text-blue-600 tracking-tight">{formatSalaryLabel(summaryStats.avg)}</p>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm col-span-3 sm:col-span-1">
          <span className="text-[9px] font-black text-slate-400 block mb-0.5 uppercase">スコープ内総年俸</span>
          <p className="text-xl font-black text-orange-600 tracking-tight">{formatSalaryLabel(summaryStats.total)}</p>
        </div>
      </div>

      {/* 🏆 Cリスト：年俸ランキングアコーディオンリスト */}
      {loading ? (
        <div className="text-center py-20 font-black text-blue-600 animate-pulse text-lg">ランキング集計ロード中...</div>
      ) : rankingData.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 font-bold text-sm">
          条件に合致する年俸データが見つかりません。
        </div>
      ) : (
        <div className="space-y-2.5 text-black">
          {rankingData.map((row, index) => {
            const isTop3 = index < 3;
            const rankBadgeClass = isTop3
              ? index === 0 ? "bg-gradient-to-b from-yellow-300 to-amber-500 text-yellow-900 font-black shadow-md scale-105"
                : index === 1 ? "bg-gradient-to-b from-slate-300 to-slate-400 text-slate-800 font-black"
                : "bg-gradient-to-b from-orange-300 to-amber-700 text-orange-950 font-black"
              : "bg-slate-100 text-slate-400 font-bold";

            return (
              <details
                key={`${row.resolvedId}_${row.year}_${index}`}
                className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden transition-all hover:border-blue-200"
              >
                {/* サマリーバー */}
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none select-none">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center italic text-sm shrink-0 ${rankBadgeClass}`}>
                      {index + 1}
                    </div>
                    {/* 選手基本メタ */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link 
                          href={`/player/${row.resolvedId}`}
                          className="text-base font-black text-slate-800 hover:text-blue-600 hover:underline tracking-tight block truncate shrink-0"
                          onClick={(e) => e.stopPropagation()} 
                        >
                          {row.resolvedName}
                        </Link>
                        <span className="text-[11px] font-bold text-slate-400 ml-1">
                          ({row.year}年)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold mt-1">
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-black tracking-tight shadow-inner ${getTeamColorClass(row.resolvedTeam)}`}>
                          {row.resolvedTeam}
                        </span>
                        <span className="text-slate-400">{row.resolvedPos}</span>
                      </div>
                    </div>
                  </div>

                  {/* 推定年俸額 */}
                  <div className="text-right pl-3 shrink-0 flex items-center gap-3">
                    <div className="leading-none">
                      <span className="text-[8px] font-black text-slate-400 block mb-0.5 text-right uppercase tracking-wider">推定年俸</span>
                      <span className="text-base font-black text-blue-600 tracking-tight">{formatSalaryLabel(row.salary)}</span>
                    </div>
                    <div className="text-slate-300 group-open:rotate-180 transition-transform duration-300">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                </summary>

                {/* アコーディオン展開時の「ミニスタッツ」結合表示ブロック */}
                <div className="px-4 pb-4 pt-3 bg-slate-50 border-t border-slate-100 text-xs font-sans">
                  {row.role === 'hitter' ? (
                    row.statB ? (
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b pb-1">📊 {row.year}年 シーズン詳細打撃スタッツ</p>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">試合</div><div className="font-black text-slate-700 text-xs">{row.statB.試合 || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">打率</div><div className="font-black text-slate-700 text-xs">{dotFormat(row.statB.打率)}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">安打</div><div className="font-black text-slate-700 text-xs">{row.statB.安打 || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">本塁打</div><div className="font-black text-red-600 text-xs">{row.statB.本塁打 || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">OPS</div><div className="font-black text-slate-700 text-xs">{dotFormat(row.statB.OPS)}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border border-orange-100 shadow-sm"><div className="text-[9px] font-black text-orange-400">wRC+</div><div className="font-black text-orange-600 text-xs">{row.statB['wRC+'] || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border border-blue-100 shadow-sm col-span-4 sm:col-span-1"><div className="text-[9px] font-black text-blue-400">野手WAR</div><div className="font-black text-blue-600 text-xs">{toF(row.statB.野手WAR).toFixed(1)}</div></div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 font-bold italic text-[11px] text-center py-2">⚠️ {row.year}年度の公式打撃成績スタッツが登録されていません</p>
                    )
                  ) : (
                    row.statP ? (
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b pb-1">📊 {row.year}年 シーズン詳細投手スタッツ</p>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">登板</div><div className="font-black text-slate-700 text-xs">{row.statP.登板 || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-red-600">防御率</div><div className="font-black text-red-600 text-xs">{toF(row.statP.防御率).toFixed(2)}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">勝利</div><div className="font-bold text-slate-700 text-xs">{row.statP.勝利 || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">セーブ</div><div className="font-bold text-slate-700 text-xs">{row.statP.セーブ || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">投球回</div><div className="font-black text-slate-700 text-xs">{row.statP.投球回 || '0'}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border shadow-inner"><div className="text-[9px] font-bold text-slate-400">奪三振</div><div className="font-black text-slate-700 text-xs">{row.statP.三振 || row.statP.奪三振 || 0}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border border-orange-100 shadow-sm"><div className="text-[9px] font-black text-orange-400">FIP</div><div className="font-black text-orange-600 text-xs">{toF(row.statP.FIP).toFixed(2)}</div></div>
                          <div className="bg-white p-1.5 rounded-lg border border-blue-100 shadow-sm col-span-4 sm:col-span-1"><div className="text-[9px] font-black text-blue-400">投手WAR</div><div className="font-black text-blue-600 text-xs">{toF(row.statP.投手WAR || row.statP.野手WAR).toFixed(1)}</div></div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 font-bold italic text-[11px] text-center py-2">⚠️ {row.year}年度の公式投手成績スタッツが登録されていません</p>
                    )
                  )}

                  <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex justify-end">
                    <Link
                      href={`/player/${row.resolvedId}`}
                      className="text-[10px] font-black text-blue-600 bg-white border border-blue-200 px-3 py-1.5 rounded-xl shadow-sm hover:bg-blue-50 transition-all flex items-center gap-1"
                    >
                      👤 {row.resolvedName} の全年度年俸推移チャート・高度指標を詳しく見る →
                    </Link>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. 画面のエントリ・デフォルトエクスポート
// ==========================================
export default function PlayerSalariesRanking() {
  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-4">
        
        <Link href="/" className="text-blue-600 font-black text-sm mb-2 inline-block px-2 hover:underline">
          ← メニュートップへ戻る
        </Link>

        <div className="bg-gradient-to-br from-blue-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl border-b-8 border-blue-600 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10 text-9xl font-black -mt-6 -mr-6 select-none italic">
            SALARY
          </div>
          <div className="relative z-10">
            <h1 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase flex items-center gap-2">
              <span>💴</span> NPB年俸データセンター
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-300 font-bold mt-1 max-w-xl leading-relaxed">
              独自に収集・名寄せ統合した全登録データ。年度別・球団別・歴代最高額など、あらゆる角度からプロ野球の市場価値をランキング化。
            </p>
          </div>
        </div>

        <Suspense fallback={<div className="text-center py-20 text-blue-600 font-black animate-pulse">データ集計を同期中...</div>}>
          <SalariesRankingContent />
        </Suspense>

      </div>

      <footer className="mt-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">
        © 2026 POWERFUL NPB ANALYTICS
      </footer>
    </main>
  );
}