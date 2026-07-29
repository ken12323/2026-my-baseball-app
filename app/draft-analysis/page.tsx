import React from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export const revalidate = 0;

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DraftAnalysisPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  
  // URLパラメータからの状態取得
  const mainTab = typeof resolvedParams.tab === 'string' ? resolvedParams.tab : 'roots';
  const subCategory = typeof resolvedParams.sub === 'string' ? resolvedParams.sub : 'all';
  const eraFilter = typeof resolvedParams.era === 'string' ? resolvedParams.era : 'active';
  const sortKey = typeof resolvedParams.sort === 'string' ? resolvedParams.sort : 'war';

  // ソートキーとソート順（昇順/降順）のマップ設定
  const sortColumnMap: Record<string, { column: string; ascending: boolean; label: string }> = {
    war: { column: 'war', ascending: false, label: '通算WAR' },
    hr: { column: 'hr', ascending: false, label: '通算本塁打' },
    hits: { column: 'hits', ascending: false, label: '通算安打' },
    wrc_plus: { column: 'wrc_plus', ascending: false, label: '平均wRC+' },
    ops: { column: 'ops', ascending: false, label: '平均OPS' },
    wins: { column: 'wins', ascending: false, label: '通算勝利' },
    ip: { column: 'ip', ascending: false, label: '通算投球回' },
    fip: { column: 'fip', ascending: true, label: '平均FIP' }, // ※FIPは低い方が優秀なため昇順
    k_bb: { column: 'k_bb', ascending: false, label: '平均K-BB%' },
  };

  const currentSort = sortColumnMap[sortKey] || sortColumnMap.war;

  // Supabaseからのデータ取得処理
  let displayData: any[] = [];
  let fetchError: any = null;

  try {
    if (mainTab === 'roots') {
      if (subCategory === 'pos_origin') {
        const { data, error } = await supabase
          .from('draft_pos_origin_stats')
          .select('*')
          .eq('era_type', eraFilter)
          .order(currentSort.column, { ascending: currentSort.ascending, nullsFirst: false });
        displayData = data || [];
        fetchError = error;
      } else {
        const { data, error } = await supabase
          .from('draft_route_stats')
          .select('*')
          .order('avghr', { ascending: false });
        displayData = data || [];
        fetchError = error;
      }
    } else if (mainTab === 'round') {
      const { data, error } = await supabase
        .from('draft_round_stats')
        .select('*')
        .order('avghr', { ascending: false });
      displayData = data || [];
      fetchError = error;
    }
  } catch (err) {
    fetchError = err;
  }

  // 補助関数: クエリ文字列作成
  const buildUrl = (newEra?: string, newSort?: string) => {
    const era = newEra !== undefined ? newEra : eraFilter;
    const sort = newSort !== undefined ? newSort : sortKey;
    return `/draft-analysis?tab=${mainTab}&sub=${subCategory}&era=${era}&sort=${sort}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      
      {/* 1. ページヘッダー */}
      <div className="mb-6 border-l-8 border-blue-600 pl-4">
        <h1 className="text-2xl md:text-3xl font-black tracking-wider text-slate-900">
          DRAFT ANALYSIS
        </h1>
        <p className="text-xs md:text-sm text-slate-600 font-bold mt-1">
          ドラフト考察：各種データ＆ルーツ深掘り分析ラボ
        </p>
      </div>

      {/* 2. メイン4大タブ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Link
          href="/draft-analysis?tab=roots&sub=all"
          className={`px-4 py-3 rounded-xl font-black text-xs md:text-sm text-center transition-all shadow-sm ${
            mainTab === 'roots'
              ? 'bg-blue-600 text-white ring-4 ring-blue-200 transform -translate-y-0.5'
              : 'bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200'
          }`}
        >
          🏫 ルーツ・コンボ
        </Link>
        <Link
          href="/draft-analysis?tab=round&sub=all"
          className={`px-4 py-3 rounded-xl font-black text-xs md:text-sm text-center transition-all shadow-sm ${
            mainTab === 'round'
              ? 'bg-blue-600 text-white ring-4 ring-blue-200 transform -translate-y-0.5'
              : 'bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200'
          }`}
        >
          📊 順位・指名史
        </Link>
        <Link
          href="/draft-analysis?tab=team&sub=all"
          className={`px-4 py-3 rounded-xl font-black text-xs md:text-sm text-center transition-all shadow-sm ${
            mainTab === 'team'
              ? 'bg-blue-600 text-white ring-4 ring-blue-200 transform -translate-y-0.5'
              : 'bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200'
          }`}
        >
          🦅 球団・育成力
        </Link>
        <Link
          href="/draft-analysis?tab=attribute&sub=all"
          className={`px-4 py-3 rounded-xl font-black text-xs md:text-sm text-center transition-all shadow-sm ${
            mainTab === 'attribute'
              ? 'bg-blue-600 text-white ring-4 ring-blue-200 transform -translate-y-0.5'
              : 'bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200'
          }`}
        >
          🧬 属性・マニアック
        </Link>
      </div>

      {/* 3. サブカテゴリー切り替え */}
      <div className="flex space-x-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
        {mainTab === 'roots' && (
          <>
            <Link href="/draft-analysis?tab=roots&sub=all" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🌱 経歴ルート大枠</Link>
            <Link href="/draft-analysis?tab=roots&sub=pos_origin" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'pos_origin' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🎯 ポジション×出身</Link>
            <Link href="/draft-analysis?tab=roots&sub=combo" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'combo' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>✨ 名門高×名門大コンボ</Link>
            <Link href="/draft-analysis?tab=roots&sub=bypass" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'bypass' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🔄 高卒即プロvs大学経由</Link>
          </>
        )}
      </div>

      {/* 4. コントロールパネル（年代フィルター ＆ ソート順選択） */}
      {mainTab === 'roots' && subCategory === 'pos_origin' && (
        <div className="bg-slate-200/80 p-3 rounded-2xl mb-6 space-y-3 shadow-inner">
          {/* 4.1 年代・対象フィルター */}
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-black text-slate-700 px-2 shrink-0">⏳ 対象区分:</span>
            <Link href={buildUrl('active')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === 'active' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🌱 現役のみ（4区分）</Link>
            <Link href={buildUrl('2020')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === '2020' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>⚡ 2020年〜（2区分）</Link>
            <Link href={buildUrl('2010')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === '2010' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🔥 2010年〜（2区分）</Link>
            <Link href={buildUrl('2000')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === '2000' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🏛️ 2000年〜（2区分）</Link>
            <Link href={buildUrl('all')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === 'all' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🌐 全選手・引退含む（2区分）</Link>
          </div>

          {/* 🌟 4.2 ソート指標切り替え */}
          <div className="flex items-center space-x-2 overflow-x-auto pt-2 border-t border-slate-300/60 no-scrollbar">
            <span className="text-xs font-black text-slate-700 px-2 shrink-0">📊 ソート順:</span>
            
            {/* 総合 */}
            <Link href={buildUrl(undefined, 'war')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'war' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🏆 通算WAR</Link>
            
            {/* 野手指標グループ */}
            <span className="text-slate-400 text-xs font-light">|</span>
            <Link href={buildUrl(undefined, 'hr')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'hr' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>💥 本塁打</Link>
            <Link href={buildUrl(undefined, 'hits')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'hits' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>⚾ 安打</Link>
            <Link href={buildUrl(undefined, 'wrc_plus')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'wrc_plus' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🚀 wRC+</Link>
            <Link href={buildUrl(undefined, 'ops')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'ops' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🎯 OPS</Link>

            {/* 投手指標グループ */}
            <span className="text-slate-400 text-xs font-light">|</span>
            <Link href={buildUrl(undefined, 'wins')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'wins' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>👑 勝利</Link>
            <Link href={buildUrl(undefined, 'ip')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'ip' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>投球回</Link>
            <Link href={buildUrl(undefined, 'fip')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'fip' ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>⚡ FIP (昇順)</Link>
            <Link href={buildUrl(undefined, 'k_bb')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'k_bb' ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🔥 K-BB%</Link>
          </div>
        </div>
      )}

      {/* 5. ハイライト発見バナー */}
      <div className="bg-amber-400 border-2 border-amber-500 rounded-2xl p-4 mb-6 shadow-md transform -rotate-0.5">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">💡</span>
          <div>
            <h3 className="font-black text-slate-950 text-sm md:text-base mb-1">
              {mainTab === 'roots' && subCategory === 'pos_origin' && (
                `【ソート：${currentSort.label}】${eraFilter === 'active' ? '現役選手' : eraFilter === 'all' ? '全選手' : `${eraFilter}年〜`} のポジション×出身ランキング`
              )}
            </h3>
            <p className="text-xs text-slate-900 font-bold leading-relaxed">
              現在「<span className="underline font-black">{currentSort.label}</span>」順で並び替えています。上のソートボタンで本塁打順、wRC+順、FIP順など自在に比較できます。
            </p>
          </div>
        </div>
      </div>

      {/* 6. データ表示エリア */}
      {fetchError ? (
        <div className="p-6 bg-red-50 border-2 border-red-300 rounded-2xl text-red-600 font-bold text-xs">
          ❌ データの取得に失敗しました：{JSON.stringify(fetchError)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 md:p-6 shadow-md">
            <h2 className="text-base md:text-lg font-black mb-4 bg-blue-600 text-white inline-block px-3 py-1 rounded-lg transform rotate-0.5 shadow-sm">
              📊 集計結果：{currentSort.label}順
            </h2>

            {/* テーブル */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-800 text-white text-xs md:text-sm">
                    <th className="p-3 rounded-l-xl font-bold">ポジション × 出身大学</th>
                    <th className="p-3 font-bold text-right">該当人数</th>
                    <th className="p-3 font-bold text-right">通算合計WAR</th>
                    <th className="p-3 font-bold text-right">主要累計①</th>
                    <th className="p-3 rounded-r-xl font-bold text-right">主要累計②</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.length > 0 ? (
                    displayData.map((item, idx) => {
                      const rowTitle = item.title || '該当ポジション';
                      const isPitcher = item.pos_category === '投手';

                      return (
                        <tr key={idx} className="border-b-2 border-slate-100 hover:bg-slate-50 text-xs md:text-sm font-bold text-slate-700">
                          {/* カラム1: タイトル ＋ 活躍選手 ＋ 現代セイバーバッジ */}
                          <td className="p-3 text-slate-900 font-black">
                            <div className="text-sm md:text-base">{rowTitle}</div>
                            
                            {/* 現代風セイバーメトリクスバッジ（ソート中の項目をハイライト） */}
                            <div className="flex items-center space-x-2 mt-1">
                              {isPitcher ? (
                                <>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold border ${sortKey === 'fip' ? 'bg-teal-600 text-white border-teal-800 ring-2 ring-teal-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                                    平均FIP: {item.fip > 0 ? item.fip : '-'}
                                  </span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold border ${sortKey === 'k_bb' ? 'bg-teal-600 text-white border-teal-800 ring-2 ring-teal-300' : 'bg-teal-100 text-teal-800 border-teal-300'}`}>
                                    K-BB%: {item.k_bb}%
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold border ${sortKey === 'wrc_plus' ? 'bg-purple-600 text-white border-purple-800 ring-2 ring-purple-300' : 'bg-purple-100 text-purple-800 border-purple-300'}`}>
                                    平均wRC+: {item.wrc_plus}
                                  </span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold border ${sortKey === 'ops' ? 'bg-indigo-600 text-white border-indigo-800 ring-2 ring-indigo-300' : 'bg-indigo-100 text-indigo-800 border-indigo-300'}`}>
                                    OPS: {item.ops > 0 ? item.ops : '-'}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* 主な活躍選手（TOP3） */}
                            {item.top_players && (
                              <div className="text-[11px] text-slate-500 font-normal mt-1">
                                👑 {item.top_players}
                              </div>
                            )}
                          </td>

                          {/* カラム2: 人数 */}
                          <td className="p-3 text-right text-slate-800">{item.players ?? 0}人</td>

                          {/* カラム3: 通算WAR（コア指標） */}
                          <td className={`p-3 text-right text-base md:text-lg ${sortKey === 'war' ? 'text-blue-700 font-black scale-105' : 'text-blue-600 font-bold'}`}>
                            {item.war ?? 0}
                          </td>

                          {/* カラム4 & 5: 投手/野手の累計動的表示（ソート中の項目をハイライト） */}
                          {isPitcher ? (
                            <>
                              <td className={`p-3 text-right ${sortKey === 'wins' ? 'text-emerald-700 font-black text-base' : 'text-emerald-600 font-extrabold'}`}>
                                {Number(item.wins ?? 0).toLocaleString()}勝
                              </td>
                              <td className={`p-3 text-right ${sortKey === 'ip' ? 'text-slate-900 font-black text-base' : 'text-slate-600 font-medium'}`}>
                                {Number(item.ip ?? 0).toLocaleString()}回
                              </td>
                            </>
                          ) : (
                            <>
                              <td className={`p-3 text-right ${sortKey === 'hr' ? 'text-amber-700 font-black text-base' : 'text-amber-600 font-extrabold'}`}>
                                {Number(item.hr ?? 0).toLocaleString()}本
                              </td>
                              <td className={`p-3 text-right ${sortKey === 'hits' ? 'text-slate-900 font-black text-base' : 'text-slate-600 font-medium'}`}>
                                {Number(item.hits ?? 0).toLocaleString()}安打
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 font-bold text-sm">
                        ⚙️ データ取得中または紐付け準備中です！
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}