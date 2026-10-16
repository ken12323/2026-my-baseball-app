"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

declare const process: any;

// Supabase 初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 型定義 ---
interface DraftStatRow {
  era_type: string;
  title: string;
  top_players: string;
  players: number;
  pa?: number;
  hits?: number;
  hr?: number;
  wrc_plus?: number;
  ops?: number;
  wins?: number;
  ip?: number;
  fip?: number | null;
  k_bb?: number;
  war: number;
  pos_category?: string;
  school_name?: string;
  route_category?: string;
}

type MainTab = "roots" | "rank_history" | "team_dev" | "special";
type SubTab = "route" | "pos_origin" | "combo" | "vs_high_univ";
type EraType = "active" | "2020" | "2010" | "2000" | "all";
type StatMetric = "war" | "hr" | "hits" | "wrc_plus" | "ops" | "wins" | "ip" | "fip" | "k_bb";

export default function DraftAnalysisPage() {
  const [mainTab, setMainTab] = useState<MainTab>("roots");
  const [subTab, setSubTab] = useState<SubTab>("route");
  const [era, setEra] = useState<EraType>("active");
  const [metric, setMetric] = useState<StatMetric>("war");
  const [data, setData] = useState<DraftStatRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 対象VIEWの判定
  const targetView = useMemo(() => {
    if (subTab === "route") return "draft_route_stats";
    if (subTab === "pos_origin") return "draft_pos_origin_stats";
    return null; // combo, vs_high_univ は準備中
  }, [subTab]);

  // データ取得
  useEffect(() => {
    async function fetchData() {
      if (!targetView) {
        setData([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data: result, error } = await supabase
          .from(targetView)
          .select("*");

        if (error) {
          console.error("データ取得エラー:", error);
          setData([]);
        } else if (result) {
          setData(result as DraftStatRow[]);
        }
      } catch (err) {
        console.error("通信エラー:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [targetView]);

  // フィルタリング & ソート処理
  const displayList = useMemo(() => {
    return data
      .filter((row) => row.era_type === era) // 厳密に選択中の時代区分だけに絞り込み（重複を100%防止）
      .sort((a, b) => {
        let aVal = a[metric] ?? 0;
        let bVal = b[metric] ?? 0;

        // FIPのみ低い方が優秀（昇順）
        if (metric === "fip") {
          aVal = a.fip === null ? 99.0 : a.fip;
          bVal = b.fip === null ? 99.0 : b.fip;
          return (aVal as number) - (bVal as number);
        }

        return (bVal as number) - (aVal as number);
      });
  }, [data, era, metric]);

  // 小数フォーマットユーティリティ
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

  // 選択中スタッツの表示フォーマット
  const renderMetricValue = (row: DraftStatRow) => {
    switch (metric) {
      case "war":
        return <span className="text-lg md:text-xl font-black text-blue-600">{row.war > 0 ? `+${row.war.toFixed(1)}` : row.war.toFixed(1)}</span>;
      case "hr":
        return <span className="text-lg md:text-xl font-black text-red-500">{row.hr ?? 0}<span className="text-xs text-slate-400 ml-0.5">本</span></span>;
      case "hits":
        return <span className="text-lg md:text-xl font-black text-slate-700">{row.hits ?? 0}<span className="text-xs text-slate-400 ml-0.5">安打</span></span>;
      case "wrc_plus":
        return <span className="text-lg md:text-xl font-black text-indigo-600">{row.wrc_plus ? row.wrc_plus.toFixed(1) : "-"}</span>;
      case "ops":
        return <span className="text-lg md:text-xl font-black text-blue-600">{dotFormat(row.ops)}</span>;
      case "wins":
        return <span className="text-lg md:text-xl font-black text-amber-600">{row.wins ?? 0}<span className="text-xs text-slate-400 ml-0.5">勝</span></span>;
      case "ip":
        return <span className="text-lg md:text-xl font-black text-slate-700">{row.ip ?? 0}<span className="text-xs text-slate-400 ml-0.5">回</span></span>;
      case "fip":
        return <span className="text-lg md:text-xl font-black text-emerald-600">{row.fip !== null && row.fip !== undefined ? row.fip.toFixed(2) : "-"}</span>;
      case "k_bb":
        return <span className="text-lg md:text-xl font-black text-orange-600">{row.k_bb ? `${row.k_bb.toFixed(1)}%` : "-"}</span>;
    }
  };

  // メトリック名の取得
  const getMetricLabel = () => {
    switch (metric) {
      case "war": return "通算合計WAR";
      case "hr": return "通算本塁打";
      case "hits": return "通算安打";
      case "wrc_plus": return "加重wRC+";
      case "ops": return "加重OPS";
      case "wins": return "通算勝利数";
      case "ip": return "通算投球回";
      case "fip": return "加重FIP";
      case "k_bb": return "K-BB%";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      {/* 1. サイトタイトルヘッダー */}
      <div className="bg-white border-b border-slate-200 pt-6 pb-6 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="border-l-4 border-blue-600 pl-3">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 uppercase">
              DRAFT ANALYSIS
            </h1>
            <p className="text-xs md:text-sm font-bold text-slate-500 mt-1">
              ドラフト考察：各種データ＆ルーツ深掘り分析ラボ
            </p>
          </div>

          {/* 2. メインタブ（4大テーマ） */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6">
            <button
              onClick={() => setMainTab("roots")}
              className={`py-3 px-4 rounded-xl font-black text-xs md:text-sm transition-all flex items-center justify-center gap-2 ${
                mainTab === "roots"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              🏕️ ルーツ・コンボ
            </button>
            <button
              onClick={() => setMainTab("rank_history")}
              className={`py-3 px-4 rounded-xl font-black text-xs md:text-sm transition-all flex items-center justify-center gap-2 ${
                mainTab === "rank_history"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              📊 順位・指名史
            </button>
            <button
              onClick={() => setMainTab("team_dev")}
              className={`py-3 px-4 rounded-xl font-black text-xs md:text-sm transition-all flex items-center justify-center gap-2 ${
                mainTab === "team_dev"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              🦅 球団・育成力
            </button>
            <button
              onClick={() => setMainTab("special")}
              className={`py-3 px-4 rounded-xl font-black text-xs md:text-sm transition-all flex items-center justify-center gap-2 ${
                mainTab === "special"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              🧬 属性・マニアック
            </button>
          </div>

          {/* 3. サブタブ（ルーツ・コンボ内） */}
          {mainTab === "roots" && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
              <button
                onClick={() => setSubTab("route")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1.5 ${
                  subTab === "route"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                🌱 経歴ルート大枠
              </button>
              <button
                onClick={() => setSubTab("pos_origin")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1.5 ${
                  subTab === "pos_origin"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                🎯 ポジション×出身
              </button>
              <button
                onClick={() => setSubTab("combo")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1.5 ${
                  subTab === "combo"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                ✨ 名門高×名門大コンボ
              </button>
              <button
                onClick={() => setSubTab("vs_high_univ")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all flex items-center gap-1.5 ${
                  subTab === "vs_high_univ"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                🔄 高卒即プロvs大学経由
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-6">
        {/* 4. コントロールバー（対象区分 ＆ 表示スタッツ） */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm mb-6 space-y-4">
          {/* 対象区分ピルボタン */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-400 mr-1 flex items-center gap-1">
              ⏳ 対象区分:
            </span>
            <button
              onClick={() => setEra("active")}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                era === "active" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              ⚡ 現役のみ
            </button>
            <button
              onClick={() => setEra("2020")}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                era === "2020" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              ⚡ 2020年〜
            </button>
            <button
              onClick={() => setEra("2010")}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                era === "2010" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              🔥 2010年〜
            </button>
            <button
              onClick={() => setEra("2000")}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                era === "2000" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              🏛️ 2000年〜
            </button>
            <button
              onClick={() => setEra("all")}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                era === "all" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              🌐 全選手（引退含む）
            </button>
          </div>

          {/* 表示スタッツ/ソート順ピルボタン */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            <span className="text-xs font-black text-slate-400 mr-1 flex items-center gap-1">
              📊 表示スタッツ:
            </span>
            {[
              { id: "war", label: "🏆 WAR(総合)" },
              { id: "hr", label: "💥 本塁打" },
              { id: "hits", label: "⚾ 安打" },
              { id: "wrc_plus", label: "🚀 wRC+" },
              { id: "ops", label: "🎯 OPS" },
              { id: "wins", label: "👑 勝利" },
              { id: "ip", label: "投球回" },
              { id: "fip", label: "⚡ FIP(昇順)" },
              { id: "k_bb", label: "🔥 K-BB%" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id as StatMetric)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  metric === m.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. テーブル表示エリア */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-12">
          {/* テーブルバナー */}
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-black">
              📊 集計結果：{getMetricLabel()}順
            </div>
          </div>

          {loading ? (
            <div className="py-24 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
              <p className="mt-3 text-xs font-bold text-slate-400">集計データを解析中...</p>
            </div>
          ) : !targetView ? (
            /* 未実装タブの案内 */
            <div className="py-24 text-center px-4">
              <div className="text-4xl mb-3">⚙️</div>
              <h3 className="text-base font-bold text-slate-800">
                {subTab === "combo" ? "「名門高×名門大コンボ」" : "「高卒即プロvs大学経由」"}は集計VIEWを準備中です
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                まずは「経歴ルート大枠」および「ポジション×出身」の分析をお楽しみください。
              </p>
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-24 text-center text-slate-400 font-bold text-sm">
              該当するデータが見つかりませんでした。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black uppercase tracking-wider">
                    <th className="py-3.5 px-5">
                      {subTab === "route" ? "経歴ルート" : "ポジション × 出身大学"}
                    </th>
                    <th className="py-3.5 px-4 text-center w-28">該当人数</th>
                    <th className="py-3.5 px-5 text-right w-36">{getMetricLabel()}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {displayList.map((row, idx) => (
                    <tr
                      key={`${row.era_type}-${row.title}-${idx}`}
                      className="hover:bg-blue-50/40 transition-colors"
                    >
                      {/* 項目名 & 看板選手 */}
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-slate-900 text-base md:text-lg">
                          {row.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                          <span className="text-amber-500">👑</span>
                          <span className="font-medium text-slate-700">{row.top_players || "ー"}</span>
                        </div>
                      </td>

                      {/* 該当人数 */}
                      <td className="py-4 px-4 text-center font-bold text-slate-600">
                        {row.players}人
                      </td>

                      {/* ソートスタッツ値 */}
                      <td className="py-4 px-5 text-right">
                        {renderMetricValue(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}