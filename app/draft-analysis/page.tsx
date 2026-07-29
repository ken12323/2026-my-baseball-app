import React from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export const revalidate = 0;

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DraftAnalysisPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  
  const mainTab = typeof resolvedParams.tab === 'string' ? resolvedParams.tab : 'roots';
  const subCategory = typeof resolvedParams.sub === 'string' ? resolvedParams.sub : 'all';
  const eraFilter = typeof resolvedParams.era === 'string' ? resolvedParams.era : 'active';
  const sortKey = typeof resolvedParams.sort === 'string' ? resolvedParams.sort : 'war';

  // 🌟 ソート設定マップ（type で 野手専用・投手専用 を定義）
  const sortColumnMap: Record<string, { column: string; ascending: boolean; label: string; unit: string; type: 'all' | 'batter' | 'pitcher' }> = {
    war: { column: 'war', ascending: false, label: '通算合計WAR', unit: '', type: 'all' },
    hr: { column: 'hr', ascending: false, label: '通算本塁打', unit: '本', type: 'batter' },
    hits: { column: 'hits', ascending: false, label: '通算安打', unit: '安打', type: 'batter' },
    wrc_plus: { column: 'wrc_plus', ascending: false, label: '平均wRC+', unit: '', type: 'batter' },
    ops: { column: 'ops', ascending: false, label: '平均OPS', unit: '', type: 'batter' },
    wins: { column: 'wins', ascending: false, label: '通算勝利', unit: '勝', type: 'pitcher' },
    ip: { column: 'ip', ascending: false, label: '通算投球回', unit: '回', type: 'pitcher' },
    fip: { column: 'fip', ascending: true, label: '平均FIP', unit: '', type: 'pitcher' }, // FIPは低数値が良
    k_bb: { column: 'k_bb', ascending: false, label: '平均K-BB%', unit: '%', type: 'pitcher' },
  };

  const currentSort = sortColumnMap[sortKey] || sortColumnMap.war;

  let displayData: any[] = [];
  let fetchError: any = null;

  try {
    if (mainTab === 'roots') {
      if (subCategory === 'pos_origin') {
        let query = supabase.from('draft_pos_origin_stats').select('*').eq('era_type', eraFilter);

        // 🎯 選択した指標が野手専用なら投手を排除、投手専用なら野手を排除！
        if (currentSort.type === 'batter') {
          query = query.neq('pos_category', '投手');
        } else if (currentSort.type === 'pitcher') {
          query = query.eq('pos_category', '投手');
        }

        // FIPの昇順ソート時に、0や未計算の選手が1位にならないよう0より大きいデータに限定
        if (sortKey === 'fip') {
          query = query.gt('fip', 0);
        }

        const { data, error } = await query.order(currentSort.column, { ascending: currentSort.ascending, nullsFirst: false });
        displayData = data || [];
        fetchError = error;
      } else {
        const { data, error } = await supabase.from('draft_route_stats').select('*').order('avghr', { ascending: false });
        displayData = data || [];
        fetchError = error;
      }
    } else if (mainTab === 'round') {
      const { data, error } = await supabase.from('draft_round_stats').select('*').order('avghr', { ascending: false });
      displayData = data || [];
      fetchError = error;
    }
  } catch (err) {
    fetchError = err;
  }

  const buildUrl = (newEra?: string, newSort?: string) => {
    const era = newEra !== undefined ? newEra : eraFilter;
    const sort = newSort !== undefined ? newSort : sortKey;
    return `/draft-analysis?tab=${mainTab}&sub=${subCategory}&era=${era}&sort=${sort}`;
  };

  // 選択中のスタッツ値をフォーマットして返す関数
  const renderSortValue = (item: any) => {
    const rawVal = item[currentSort.column];
    if (rawVal === undefined || rawVal === null) return '-';
    
    // 小数やカンマを整えて単位をつける
    if (currentSort.unit === '本' || currentSort.unit === '安打' || currentSort.unit === '勝' || currentSort.unit === '回') {
      return `${Number(rawVal).toLocaleString()}${currentSort.unit}`;
    }
    if (currentSort.unit === '%') {
      return `${rawVal}${currentSort.unit}`;
    }
    return rawVal;
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

      {/* 4. コントロールパネル（年代 ＆ 表示スタッツ選択） */}
      {mainTab === 'roots' && subCategory === 'pos_origin' && (
        <div className="bg-slate-200/80 p-3 rounded-2xl mb-6 space-y-3 shadow-inner">
          {/* 4.1 年代・対象フィルター */}
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-black text-slate-700 px-2 shrink-0">⏳ 対象区分:</span>
            <Link href={buildUrl('active')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === 'active' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🌱 現役のみ</Link>
            <Link href={buildUrl('2020')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === '2020' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>⚡ 2020年〜</Link>
            <Link href={buildUrl('2010')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === '2010' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🔥 2010年〜</Link>
            <Link href={buildUrl('2000')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === '2000' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🏛️ 2000年〜</Link>
            <Link href={buildUrl('all')} className={`px-3 py-1 rounded-xl text-xs font-black whitespace-nowrap transition-all ${eraFilter === 'all' ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🌐 全選手（引退含）</Link>
          </div>

          {/* 4.2 表示・ソート指標切り替え */}
          <div className="flex items-center space-x-2 overflow-x-auto pt-2 border-t border-slate-300/60 no-scrollbar">
            <span className="text-xs font-black text-slate-700 px-2 shrink-0">📊 表示スタッツ:</span>
            
            <Link href={buildUrl(undefined, 'war')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'war' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🏆 WAR (総合)</Link>
            
            <span className="text-slate-400 text-xs font-light">|</span>
            <Link href={buildUrl(undefined, 'hr')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'hr' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>💥 本塁打</Link>
            <Link href={buildUrl(undefined, 'hits')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'hits' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>⚾ 安打</Link>
            <Link href={buildUrl(undefined, 'wrc_plus')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'wrc_plus' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🚀 wRC+</Link>
            <Link href={buildUrl(undefined, 'ops')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'ops' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🎯 OPS</Link>

            <span className="text-slate-400 text-xs font-light">|</span>
            <Link href={buildUrl(undefined, 'wins')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'wins' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>👑 勝利</Link>
            <Link href={buildUrl(undefined, 'ip')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'ip' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>投球回</Link>
            <Link href={buildUrl(undefined, 'fip')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'fip' ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>⚡ FIP (昇順)</Link>
            <Link href={buildUrl(undefined, 'k_bb')} className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${sortKey === 'k_bb' ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>🔥 K-BB%</Link>
          </div>
        </div>
      )}

      {/* 5. データ表示エリア（極限まで削ぎ落とした3列構成！） */}
      {fetchError ? (
        <div className="p-6 bg-red-50 border-2 border-red-300 rounded-2xl text-red-600 font-bold text-xs">
          ❌ データの取得に失敗しました：{JSON.stringify(fetchError)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 md:p-6 shadow-md">
            
            {mainTab === 'roots' && subCategory === 'pos_origin' && (
              <h2 className="text-base md:text-lg font-black mb-4 bg-blue-600 text-white inline-block px-3 py-1 rounded-lg transform rotate-0.5 shadow-sm">
                📊 {currentSort.label} ランキング
              </h2>
            )}

            {/* テーブル */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-left border-collapse min-w-[360px]">
                <thead>
                  <tr className="bg-slate-800 text-white text-xs md:text-sm">
                    <th className="p-3 rounded-l-xl font-bold">ポジション × 出身大学</th>
                    <th className="p-3 font-bold text-center w-20">該当人数</th>
                    <th className="p-3 rounded-r-xl font-black text-right w-28 text-blue-300 bg-slate-700/50">
                      {currentSort.label}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.length > 0 ? (
                    displayData.map((item, idx) => {
                      const rowTitle = item.title || '該当データなし';

                      return (
                        <tr key={idx} className="border-b-2 border-slate-100 hover:bg-slate-50 text-xs md:text-sm font-bold text-slate-700">
                          {/* カラム1: タイトル ＋ 主な活躍選手名 */}
                          <td className="p-3 text-slate-900 font-black">
                            <div className="text-sm md:text-base">{rowTitle}</div>
                            {item.top_players && (
                              <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                                👑 {item.top_players}
                              </div>
                            )}
                          </td>

                          {/* カラム2: 人数 */}
                          <td className="p-3 text-center text-slate-600">{item.players ?? 0}人</td>

                          {/* カラム3: 選択した項目だけの数値（ドーンと強調） */}
                          <td className="p-3 text-right text-blue-600 font-black text-lg md:text-xl bg-blue-50/50">
                            {renderSortValue(item)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-400 font-bold text-sm">
                        ⚙️ データがありません。条件を変更してください。
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