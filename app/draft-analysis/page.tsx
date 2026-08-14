"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { 
  GraduationCap, 
  Trophy, 
  Users, 
  Sparkles,
  ArrowUpDown,
  Building2,
  Medal,
  GitFork,
  Swords,
  Target
} from "lucide-react";

// Supabase 初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 型定義 ---
interface BaseStat {
  era_type: "active" | "all";
  title: string;
  top_players: string;
  top_batters?: string;
  top_pitchers?: string;
  players: number;
  pa: number;
  hits: number;
  avg_hits: number;
  hr: number;
  avg_hr: number;
  wrc_plus: number;
  ops: number;
  wins: number;
  avg_wins: number;
  ip: number;
  fip: number | null;
  k_bb: number;
  war: number;
  avg_war: number;
  pos_category?: "投手" | "捕手" | "内野手" | "外野手";
  school_name?: string;
  route_category?: string;
  rank_category?: string;
  team_name?: string;
}

type MainTab = "pos_origin" | "route" | "rank" | "team";
type ViewMode = "batter" | "pitcher";
type PosFilter = "ALL" | "投手" | "捕手" | "内野手" | "外野手";
type EraFilter = "active" | "all";
type SortKey = "war" | "avg_war" | "wrc_plus" | "ops" | "hr" | "hits" | "wins" | "fip" | "players";

export default function DraftAnalysisPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("pos_origin");
  const [viewMode, setViewMode] = useState<ViewMode>("batter");
  const [data, setData] = useState<BaseStat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [era, setEra] = useState<EraFilter>("active");
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("war");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 対象VIEW名
  const targetView = useMemo(() => {
    switch (activeTab) {
      case "pos_origin": return "draft_pos_origin_stats";
      case "route": return "draft_route_stats";
      case "rank": return "draft_rank_stats";
      case "team": return "draft_team_stats";
    }
  }, [activeTab]);

  // データ取得
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: result, error } = await supabase
          .from(targetView)
          .select("*");

        if (error) {
          console.error("データ取得エラー:", error);
          setData([]);
        } else if (result) {
          setData(result as BaseStat[]);
        }
      } catch (err) {
        console.error("通信エラー:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [targetView]);

  // 小数フォーマット
  const dotFormat = (val: number | string | null | undefined): string => {
    if (val === null || val === undefined) return "-";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "-";
    if (num === 0) return ".000";
    const formatted = num.toFixed(3);
    if (num > 0 && num < 1) return formatted.replace(/^0\./, ".");
    if (num < 0 && num > -1) return formatted.replace(/^-0\./, "-.");
    return formatted;
  };

  // 1人あたり平均WARに基づく適正ランク判定
  const getAvgWarBadge = (avgWar: number) => {
    if (avgWar >= 5.0) return <span className="px-1.5 py-0.5 text-[10px] font-black italic rounded bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-xs">SSS</span>;
    if (avgWar >= 3.5) return <span className="px-1.5 py-0.5 text-[10px] font-black italic rounded bg-slate-500 text-white shadow-xs">SS</span>;
    if (avgWar >= 2.0) return <span className="px-1.5 py-0.5 text-[10px] font-black italic rounded bg-amber-500 text-white shadow-xs">S</span>;
    if (avgWar >= 1.0) return <span className="px-1.5 py-0.5 text-[10px] font-black italic rounded bg-blue-500 text-white shadow-xs">A</span>;
    return <span className="px-1.5 py-0.5 text-[10px] font-black italic rounded bg-gray-400 text-white shadow-xs">B</span>;
  };

  // フィルタ & ソート
  const filteredAndSortedData = useMemo(() => {
    return data
      .filter((item) => {
        if (item.era_type !== era) return false;
        if (activeTab === "pos_origin" && pos !== "ALL" && item.pos_category !== pos) return false;
        return true;
      })
      .sort((a, b) => {
        let aVal = a[sortKey] ?? 0;
        let bVal = b[sortKey] ?? 0;

        if (sortKey === "fip") {
          aVal = a.fip === null ? 99.0 : a.fip;
          bVal = b.fip === null ? 99.0 : b.fip;
          return sortOrder === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        }

        return sortOrder === "desc" 
          ? (bVal as number) - (aVal as number)
          : (aVal as number) - (bVal as number);
      });
  }, [data, era, pos, activeTab, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortOrder(key === "fip" ? "asc" : "desc");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* ヒーローヘッダー */}
      <div className="bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-950 text-white pt-10 pb-12 px-4 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            プロ野球ドラフト戦略・ルーツ分析
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <Trophy className="w-8 h-8 md:w-10 md:h-10 text-yellow-400" />
            ドラフト考察・ルーツ別ランキング
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-300">
            出身大学・ポジション・ドラフト順位・経由ルートごとの通算実績を加重平均セイバーメトリクスで徹底解剖。
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-6">
        {/* メインタブ切り替え */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-200/80 p-1.5 rounded-2xl mb-4 shadow-sm">
          <button
            onClick={() => { setActiveTab("pos_origin"); setSortKey("war"); }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition-all ${
              activeTab === "pos_origin" ? "bg-white text-blue-600 shadow-md" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <GraduationCap className="w-4 h-4" /> ポジション×出身
          </button>
          <button
            onClick={() => { setActiveTab("route"); setSortKey("war"); }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition-all ${
              activeTab === "route" ? "bg-white text-blue-600 shadow-md" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <GitFork className="w-4 h-4" /> ドラフト経由別
          </button>
          <button
            onClick={() => { setActiveTab("rank"); setSortKey("war"); }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition-all ${
              activeTab === "rank" ? "bg-white text-blue-600 shadow-md" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Medal className="w-4 h-4" /> 指名順位別
          </button>
          <button
            onClick={() => { setActiveTab("team"); setSortKey("war"); }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition-all ${
              activeTab === "team" ? "bg-white text-blue-600 shadow-md" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 className="w-4 h-4" /> 球団別育成傾向
          </button>
        </div>

        {/* サブコントロールパネル */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* 現役 / 通算 */}
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl self-start">
              <button
                onClick={() => setEra("active")}
                className={`px-4 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                  era === "active" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🔥 現役選手のみ
              </button>
              <button
                onClick={() => setEra("all")}
                className={`px-4 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                  era === "all" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📜 歴代・通算
              </button>
            </div>

            {/* ポジション別 または 視点切り替え */}
            {activeTab === "pos_origin" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {(["ALL", "投手", "捕手", "内野手", "外野手"] as PosFilter[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPos(p)}
                    className={`px-3 py-1 text-xs md:text-sm font-bold rounded-lg transition-all ${
                      pos === p ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {p === "ALL" ? "全ポジション" : p}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl self-start md:self-auto">
                <button
                  onClick={() => setViewMode("batter")}
                  className={`flex items-center gap-1 px-3.5 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                    viewMode === "batter" ? "bg-amber-500 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Swords className="w-3.5 h-3.5" /> ⚔️ 野手視点
                </button>
                <button
                  onClick={() => setViewMode("pitcher")}
                  className={`flex items-center gap-1 px-3.5 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                    viewMode === "pitcher" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" /> 🎯 投手視点
                </button>
              </div>
            )}
          </div>

          {/* ソートボタンバー */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> 並び替え:
            </span>
            <button
              onClick={() => handleSort("war")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                sortKey === "war" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              通算WAR {sortKey === "war" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
            <button
              onClick={() => handleSort("avg_war")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                sortKey === "avg_war" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              平均WAR {sortKey === "avg_war" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>

            {(activeTab === "pos_origin" ? pos !== "投手" : viewMode === "batter") && (
              <>
                <button
                  onClick={() => handleSort("wrc_plus")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "wrc_plus" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  加重wRC+ {sortKey === "wrc_plus" && (sortOrder === "desc" ? "↓" : "↑")}
                </button>
                <button
                  onClick={() => handleSort("ops")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "ops" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  加重OPS {sortKey === "ops" && (sortOrder === "desc" ? "↓" : "↑")}
                </button>
                <button
                  onClick={() => handleSort("hr")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "hr" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  本塁打 {sortKey === "hr" && (sortOrder === "desc" ? "↓" : "↑")}
                </button>
              </>
            )}

            {(activeTab === "pos_origin" ? (pos === "ALL" || pos === "投手") : viewMode === "pitcher") && (
              <>
                <button
                  onClick={() => handleSort("wins")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "wins" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  勝利数 {sortKey === "wins" && (sortOrder === "desc" ? "↓" : "↑")}
                </button>
                <button
                  onClick={() => handleSort("fip")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "fip" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  加重FIP {sortKey === "fip" && (sortOrder === "asc" ? "↑(良)" : "↓")}
                </button>
              </>
            )}

            <button
              onClick={() => handleSort("players")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                sortKey === "players" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              輩出人数 {sortKey === "players" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
        </div>

        {/* ランキングリスト */}
        {loading ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-3 text-sm font-bold text-slate-500">集計データを読み込み中...</p>
          </div>
        ) : filteredAndSortedData.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500 font-bold">該当するデータが見つかりませんでした。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedData.map((item, index) => {
              const showPitcherStats = activeTab === "pos_origin" 
                ? item.pos_category === "投手" 
                : viewMode === "pitcher";

              // 視点（野手/投手）に合わせた看板選手の切り替え
              const displayTopPlayers = activeTab === "pos_origin"
                ? item.top_players
                : viewMode === "batter"
                  ? (item.top_batters || item.top_players)
                  : (item.top_pitchers || item.top_players);

              return (
                <div
                  key={`${item.era_type}-${item.title}-${index}`}
                  className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* 左側：順位・タイトル・看板選手 */}
                  <div className="flex items-start gap-3.5">
                    <div className="flex flex-col items-center justify-center min-w-[36px]">
                      <span className={`text-lg font-black italic ${
                        index === 0 ? "text-amber-500" : index === 1 ? "text-slate-400" : index === 2 ? "text-amber-700" : "text-slate-600"
                      }`}>
                        #{index + 1}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.pos_category && (
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                            item.pos_category === "投手" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {item.pos_category}
                          </span>
                        )}
                        <h2 className="text-base md:text-lg font-extrabold text-slate-900">
                          {item.title}
                        </h2>
                        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                          <Users className="w-3 h-3" /> {item.players}名
                        </span>
                      </div>

                      {/* 看板選手（WAR順） */}
                      <div className="mt-2 text-xs text-slate-600">
                        <span className="font-bold text-slate-400 mr-1.5">
                          ★ {showPitcherStats ? "看板投手(WAR順):" : "看板野手(WAR順):"}
                        </span>
                        <span className="text-slate-800 font-bold">{displayTopPlayers || "ー"}</span>
                      </div>
                    </div>
                  </div>

                  {/* 右側：スタッツ */}
                  <div className="flex items-center gap-3 md:gap-4 bg-slate-50 p-2.5 md:p-3 rounded-xl border border-slate-100 self-end md:self-auto w-full md:w-auto justify-around md:justify-end overflow-x-auto">
                    {/* 通算WAR */}
                    <div className="text-center min-w-[60px]">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">通算WAR</div>
                      <div className="text-sm md:text-base font-black text-slate-900">
                        {item.war > 0 ? `+${item.war.toFixed(1)}` : item.war.toFixed(1)}
                      </div>
                    </div>

                    {/* 1人あたり平均WAR */}
                    <div className="text-center min-w-[55px]">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">平均WAR</div>
                      <div className="text-sm md:text-base font-black text-slate-700 flex items-center justify-center gap-1">
                        {item.avg_war > 0 ? `+${item.avg_war.toFixed(1)}` : item.avg_war.toFixed(1)}
                        {getAvgWarBadge(item.avg_war)}
                      </div>
                    </div>

                    {showPitcherStats ? (
                      /* 投手指標 */
                      <>
                        <div className="text-center min-w-[50px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">通算勝利</div>
                          <div className="text-sm md:text-base font-black text-slate-800">{item.wins}勝</div>
                        </div>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">加重FIP</div>
                          <div className="text-sm md:text-base font-black text-emerald-600">
                            {item.fip !== null ? item.fip.toFixed(2) : "ー"}
                          </div>
                        </div>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">K-BB%</div>
                          <div className="text-sm md:text-base font-black text-blue-600">
                            {item.k_bb.toFixed(1)}%
                          </div>
                        </div>
                      </>
                    ) : (
                      /* 野手指標 */
                      <>
                        <div className="text-center min-w-[50px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">本塁打</div>
                          <div className="text-sm md:text-base font-black text-slate-800">{item.hr}本</div>
                        </div>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">加重wRC+</div>
                          <div className="text-sm md:text-base font-black text-indigo-600">
                            {item.wrc_plus.toFixed(1)}
                          </div>
                        </div>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">加重OPS</div>
                          <div className="text-sm md:text-base font-black text-blue-600">
                            {dotFormat(item.ops)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}