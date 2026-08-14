"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { 
  GraduationCap, 
  Trophy, 
  Flame, 
  TrendingUp, 
  Users, 
  ShieldCheck, 
  Sparkles,
  ChevronRight,
  ArrowUpDown
} from "lucide-react";

// Supabase クライアント初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 型定義 ---
interface PosOriginStat {
  era_type: "active" | "all";
  title: string;
  pos_category: "投手" | "捕手" | "内野手" | "外野手";
  position_name: string;
  school_name: string;
  top_players: string;
  players: number;
  pa: number;
  hits: number;
  hr: number;
  wrc_plus: number;
  ops: number;
  wins: number;
  ip: number;
  fip: number | null;
  k_bb: number;
  war: number;
}

type PosFilter = "ALL" | "投手" | "捕手" | "内野手" | "外野手";
type EraFilter = "active" | "all";
type SortKey = "war" | "wrc_plus" | "ops" | "hr" | "hits" | "wins" | "fip" | "k_bb" | "players";

export default function DraftAnalysisPage() {
  const [data, setData] = useState<PosOriginStat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [era, setEra] = useState<EraFilter>("active");
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("war");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 1. データ取得
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: result, error } = await supabase
          .from("draft_pos_origin_stats")
          .select("*");

        if (error) {
          console.error("データ取得エラー:", error);
        } else if (result) {
          setData(result as PosOriginStat[]);
        }
      } catch (err) {
        console.error("通信エラー:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 2. 小数フォーマットユーティリティ (仕様書準拠)
  const dotFormat = (val: number | string | null | undefined): string => {
    if (val === null || val === undefined) return "-";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "-";
    if (num === 0) return ".000";
    const formatted = num.toFixed(3);
    if (num > 0 && num < 1) {
      return formatted.replace(/^0\./, ".");
    }
    if (num < 0 && num > -1) {
      return formatted.replace(/^-0\./, "-.");
    }
    return formatted;
  };

  // 3. ランク判定バッジ (2026年仕様基準)
  const getWarBadge = (war: number) => {
    if (war >= 6.0) return <span className="px-2 py-0.5 text-xs font-black italic rounded-md bg-gradient-to-b from-yellow-300 via-orange-500 to-red-600 text-white shadow-sm">SSS</span>;
    if (war >= 4.5) return <span className="px-2 py-0.5 text-xs font-black italic rounded-md bg-slate-400 text-white shadow-sm">SS</span>;
    if (war >= 3.0) return <span className="px-2 py-0.5 text-xs font-black italic rounded-md bg-amber-500 text-white shadow-sm">S</span>;
    if (war >= 1.5) return <span className="px-2 py-0.5 text-xs font-black italic rounded-md bg-blue-500 text-white shadow-sm">A</span>;
    return <span className="px-2 py-0.5 text-xs font-black italic rounded-md bg-gray-400 text-white shadow-sm">B</span>;
  };

  // 4. フィルタリングとソート処理
  const filteredAndSortedData = useMemo(() => {
    return data
      .filter((item) => {
        // 時代フィルター (現役 / 通算)
        if (item.era_type !== era) return false;
        // ポジションフィルター
        if (pos !== "ALL" && item.pos_category !== pos) return false;
        return true;
      })
      .sort((a, b) => {
        let aVal = a[sortKey] ?? 0;
        let bVal = b[sortKey] ?? 0;

        // FIPのみ数値が低いほうが優秀
        if (sortKey === "fip") {
          aVal = a.fip === null ? 99.0 : a.fip;
          bVal = b.fip === null ? 99.0 : b.fip;
          return sortOrder === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        }

        if (sortOrder === "desc") {
          return (bVal as number) - (aVal as number);
        } else {
          return (aVal as number) - (bVal as number);
        }
      });
  }, [data, era, pos, sortKey, sortOrder]);

  // ソート切り替えハンドラー
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
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white pt-10 pb-12 px-4 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            ドラフト戦略・ルーツ分析データベース
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <GraduationCap className="w-8 h-8 md:w-10 md:h-10 text-yellow-400" />
            ポジション × 出身大学 ランキング
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-300">
            どの大学がどのポジションのプロ野球選手を最もハイレベルに輩出しているかを完全集計。打席数・投球回に応じた加重平均セイバーメトリクスで徹底比較。
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-6">
        {/* コントロールパネル */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* 現役 / 通算 切り替え */}
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl self-start">
              <button
                onClick={() => setEra("active")}
                className={`px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${
                  era === "active"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🔥 現役選手のみ
              </button>
              <button
                onClick={() => setEra("all")}
                className={`px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${
                  era === "all"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📜 歴代・通算
              </button>
            </div>

            {/* ポジション切り替えタブ */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(["ALL", "投手", "捕手", "内野手", "外野手"] as PosFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPos(p)}
                  className={`px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                    pos === p
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {p === "ALL" ? "全ポジション" : p}
                </button>
              ))}
            </div>
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
            {(pos === "ALL" || pos !== "投手") && (
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
                <button
                  onClick={() => handleSort("hits")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "hits" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  安打 {sortKey === "hits" && (sortOrder === "desc" ? "↓" : "↑")}
                </button>
              </>
            )}
            {(pos === "ALL" || pos === "投手") && (
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
                <button
                  onClick={() => handleSort("k_bb")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-all ${
                    sortKey === "k_bb" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  K-BB% {sortKey === "k_bb" && (sortOrder === "desc" ? "↓" : "↑")}
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

        {/* ランキングリスト表示 */}
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
              const isPitcher = item.pos_category === "投手";
              return (
                <div
                  key={`${item.era_type}-${item.pos_category}-${item.school_name}`}
                  className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* 左側：順位・大学・ポジション・主な選手 */}
                  <div className="flex items-start gap-3.5">
                    <div className="flex flex-col items-center justify-center min-w-[40px]">
                      <span className={`text-lg font-black italic ${
                        index === 0 ? "text-amber-500" : index === 1 ? "text-slate-400" : index === 2 ? "text-amber-700" : "text-slate-600"
                      }`}>
                        #{index + 1}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                          isPitcher ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {item.pos_category}
                        </span>
                        <h2 className="text-base md:text-lg font-extrabold text-slate-900">
                          {item.school_name}
                        </h2>
                        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                          <Users className="w-3 h-3" /> {item.players}名輩出
                        </span>
                      </div>

                      <div className="mt-1.5 text-xs text-slate-600">
                        <span className="font-semibold text-slate-400 mr-1">主な選手:</span>
                        <span className="text-slate-700 font-medium">{item.top_players || "ー"}</span>
                      </div>
                    </div>
                  </div>

                  {/* 右側：スタッツグリッド */}
                  <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 self-end md:self-auto w-full md:w-auto justify-around md:justify-end">
                    {/* WAR */}
                    <div className="text-center min-w-[60px]">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">通算WAR</div>
                      <div className="text-sm md:text-base font-black text-slate-900 flex items-center justify-center gap-1">
                        {item.war > 0 ? `+${item.war.toFixed(1)}` : item.war.toFixed(1)}
                        {getWarBadge(item.war)}
                      </div>
                    </div>

                    {isPitcher ? (
                      <>
                        <div className="text-center min-w-[50px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">勝利</div>
                          <div className="text-sm md:text-base font-black text-slate-800">{item.wins}勝</div>
                        </div>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">投球回</div>
                          <div className="text-sm md:text-base font-black text-slate-800">{item.ip}回</div>
                        </div>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">加重FIP</div>
                          <div className="text-sm md:text-base font-black text-indigo-600">
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
                      <>
                        <div className="text-center min-w-[55px]">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">打席数</div>
                          <div className="text-sm md:text-base font-black text-slate-800">{item.pa}</div>
                        </div>
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