import React from 'react';
import { supabase } from '@/lib/supabase';

export const revalidate = 0; 

export default async function DraftAnalysisPage() {
  // ✅ 修正ポイント①：大文字の avgHr から、小文字の avghr に変更
  const { data: routeData, error } = await supabase
    .from('draft_route_stats')
    .select('*')
    .order('avghr', { ascending: false });

  if (error) {
    console.error('データの取得に失敗しました:', error);
    return (
      <div className="p-8 text-red-600 font-bold bg-red-50 border-2 border-red-300 rounded-2xl m-4">
        <h2 className="text-lg mb-2">❌ Supabase接続エラー詳細</h2>
        <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto">
          {JSON.stringify(error, null, 2)}
        </pre>
      </div>
    );
  }

  const displayData = routeData || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="mb-6 border-l-8 border-blue-600 pl-4">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider text-slate-900">
          DRAFT ANALYSIS
        </h1>
        <p className="text-sm text-slate-600 font-bold mt-1">
          ドラフト考察：経歴ルート別データ分析（野手編）
        </p>
      </div>

      <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-6 shadow-sm">
        <p className="text-xs md:text-sm font-bold text-blue-900 leading-relaxed">
          💡 データの真実：現役選手数では高卒が最多であり、1人あたりの平均本塁打数でもトップを記録しています。スラッガー（長距離砲）を狙う場合のドラフト戦略において、高卒指名の重要性を裏付けるデータです。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8">
        
        {/* ランキングカード */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-md">
          <h2 className="text-lg font-extrabold mb-4 bg-amber-400 text-slate-950 inline-block px-3 py-1 rounded-lg transform -rotate-1 shadow-sm">
            🏆 1人あたり平均本塁打ランキング
          </h2>
          <div className="space-y-4">
            {displayData.map((item, index) => {
              const medalColor = index === 0 ? 'bg-amber-400 text-slate-950' : index === 1 ? 'bg-slate-300 text-slate-900' : 'bg-amber-600 text-white';
              return (
                <div key={item.route} className="flex items-center justify-between border-2 border-slate-100 rounded-xl p-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center space-x-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-lg shadow-sm ${medalColor}`}>
                      {index + 1}
                    </span>
                    <span className="font-black text-base md:text-lg text-slate-900">{item.route}</span>
                  </div>
                  <div className="text-right">
                    {/* ✅ 修正ポイント②：item.avgHr から item.avghr に変更 */}
                    <span className="text-2xl font-black text-blue-600">{item.avghr}</span>
                    <span className="text-xs font-bold text-slate-500 ml-1">本 / 人</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 詳細データテーブル */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-md overflow-hidden">
          <h2 className="text-lg font-extrabold mb-4 bg-blue-600 text-white inline-block px-3 py-1 rounded-lg transform rotate-1 shadow-sm">
            📊 経歴ルート別詳細データ一覧
          </h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-slate-800 text-white text-xs md:text-sm">
                  <th className="p-3 rounded-l-xl font-bold">経歴ルート</th>
                  <th className="p-3 font-bold text-right">現役選手数</th>
                  <th className="p-3 font-bold text-right">ルート合計本塁打</th>
                  <th className="p-3 font-bold text-right">ルート合計安打</th>
                  <th className="p-3 rounded-r-xl font-bold text-right">1人平均本塁打</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((item) => (
                  <tr key={item.route} className="border-b-2 border-slate-100 hover:bg-slate-50 text-xs md:text-sm font-bold text-slate-700">
                    <td className="p-3 text-slate-900 font-black">{item.route}</td>
                    <td className="p-3 text-right">{item.players}人</td>
                    <td className="p-3 text-right text-amber-600 font-extrabold">{Number(item.hr).toLocaleString()}本</td>
                    <td className="p-3 text-right">{Number(item.hits).toLocaleString()}安打</td>
                    {/* ✅ 修正ポイント③：item.avgHr から item.avghr に変更 */}
                    <td className="p-3 text-right text-blue-600 font-black text-base">{item.avghr}本</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}