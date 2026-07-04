"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

// ==========================================
// 0. 型定義
// ==========================================
interface SalaryRecord {
  year: number;
  salary: number;
  team_name: string;
}

interface PlayerSalaryChartProps {
  salaryHistory: SalaryRecord[];
}

// ==========================================
// 1. ユーティリティ関数
// ==========================================
const formatSalaryLabel = (value: number): string => {
  if (value >= 100000000) {
    const oku = Math.floor(value / 100000000);
    const man = Math.floor((value % 100000000) / 10000);
    return man > 0 ? `${oku}億${man}万円` : `${oku}億円`;
  }
  return `${Math.floor(value / 10000)}万円`;
};

const formatYAxis = (value: any): string => {
  const numValue = Number(value);
  if (isNaN(numValue)) return String(value);

  if (numValue >= 100000000) {
    return `${numValue / 100000000}億円`;
  }
  return `${numValue / 10000}万`;
};

const CustomTooltip = ({ active, payload }: any): React.ReactElement | null => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as SalaryRecord;
    return (
      <div className="bg-white p-3 shadow-lg rounded-lg border border-slate-100 z-50 text-xs font-sans text-slate-800">
        <p className="font-bold mb-1">📅 {data.year}年度</p>
        <p className="mb-1">
          <span className="font-medium text-slate-400">所属:</span> {data.team_name}
        </p>
        <p className="text-blue-600 font-bold text-sm">
          <span className="font-medium text-slate-400 text-xs">推定:</span> {formatSalaryLabel(data.salary)}
        </p>
      </div>
    );
  }
  return null;
};

// ==========================================
// 3. メイン・チャートコンポーネント（自己診断機能付き）
// ==========================================
export default function PlayerSalaryChart({ salaryHistory }: PlayerSalaryChartProps) {
  
  // 年度順（昇順）にソート
  const sortedData = [...(salaryHistory || [])].sort((a, b) => a.year - b.year);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-slate-100 w-full space-y-4">
      
      {/* 🛠️ 【新設】1秒で原因を特定する自己診断デバッグボード */}
      <div className="bg-slate-900 text-emerald-400 p-3 rounded-lg text-[11px] font-mono leading-relaxed shadow-inner">
        <p className="font-bold text-white mb-1">🔍 バックエンド自己診断ステース</p>
        <p>・受け取ったレコード総数: <span className="text-yellow-300 font-bold">{salaryHistory?.length ?? 0} 件</span></p>
        <p className="text-slate-400 mt-1">・届いている生データ(JSON):</p>
        <pre className="text-slate-300 bg-black/40 p-2 rounded mt-1 overflow-x-auto max-h-24">
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

      {/* データが0件だった場合の救済表示 */}
      {(!sortedData || sortedData.length === 0) ? (
        <div className="text-center py-6 text-sm text-slate-400 bg-slate-50 rounded-lg border border-dashed">
          現在、この選手の紐付け済み年俸データは0件です。
        </div>
      ) : (
        <div className="w-full overflow-x-auto scrollbar-thin">
          <div className="min-w-[500px] h-[280px] sm:h-[350px] pr-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sortedData}
                margin={{ top: 15, right: 10, left: 15, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="year" 
                  stroke="#94a3b8" 
                  fontSize={11}
                  tickLine={false}
                  dy={8}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={11}
                  tickFormatter={formatYAxis}
                  tickLine={false}
                  dx={-8}
                />
                <Tooltip 
                  content={(props) => <CustomTooltip {...props} />} 
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} 
              />
                <Line
                  type="monotone"
                  dataKey="salary"
                  stroke="#2563eb"
                  strokeWidth={3}
                  activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#2563eb' }}
                  dot={{ r: 4, stroke: '#ffffff', strokeWidth: 1.5, fill: '#2563eb' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}