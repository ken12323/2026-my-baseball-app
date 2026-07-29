import React from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export const revalidate = 0;

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DraftAnalysisPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  
  // URLパラメータからの状態取得（デフォルト設定）
  const mainTab = typeof resolvedParams.tab === 'string' ? resolvedParams.tab : 'roots';
  const subCategory = typeof resolvedParams.sub === 'string' ? resolvedParams.sub : 'all';

  // Supabaseからのデータ取得処理（現状実装済みのViewから取得）
  let displayData: any[] = [];
  let fetchError = null;

  if (mainTab === 'roots' && subCategory === 'all') {
    const { data, error } = await supabase
      .from('draft_route_stats')
      .select('*')
      .order('avghr', { ascending: false });
    displayData = data || [];
    fetchError = error;
  } else if (mainTab === 'round') {
    const { data, error } = await supabase
      .from('draft_round_stats')
      .select('*')
      .order('avghr', { ascending: false });
    displayData = data || [];
    fetchError = error;
  }

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

      {/* 2. メイン4大タブ（パワプロ風高コントラストデザイン） */}
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

      {/* 3. サブカテゴリー切り替え（チップ型Pillボタン） */}
      <div className="flex space-x-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {mainTab === 'roots' && (
          <>
            <Link href="/draft-analysis?tab=roots&sub=all" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🌱 経歴ルート大枠</Link>
            <Link href="/draft-analysis?tab=roots&sub=pos_origin" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'pos_origin' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🎯 ポジション×出身</Link>
            <Link href="/draft-analysis?tab=roots&sub=combo" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'combo' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>✨ 名門高×名門大コンボ</Link>
            <Link href="/draft-analysis?tab=roots&sub=bypass" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'bypass' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🔄 高卒即プロvs大学経由</Link>
          </>
        )}
        {mainTab === 'round' && (
          <>
            <Link href="/draft-analysis?tab=round&sub=all" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🏅 順位別期待値</Link>
            <Link href="/draft-analysis?tab=round&sub=role" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'role' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🎯 役割別（主砲/エース）</Link>
            <Link href="/draft-analysis?tab=round&sub=dev" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'dev' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🎰 育成ドラフト下剋上</Link>
            <Link href="/draft-analysis?tab=round&sub=history" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'history' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>📅 ドラフト指名一覧</Link>
          </>
        )}
        {mainTab === 'team' && (
          <>
            <Link href="/draft-analysis?tab=team&sub=all" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🏛️ チームの核（生え抜き率）</Link>
            <Link href="/draft-analysis?tab=team&sub=ripening" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'ripening' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>⏳ 覚醒までの熟成期間</Link>
            <Link href="/draft-analysis?tab=team&sub=report" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'report' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>📝 球団別ドラフト通信簿</Link>
            <Link href="/draft-analysis?tab=team&sub=cospa" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'cospa' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>💰 年俸コスパランキング</Link>
          </>
        )}
        {mainTab === 'attribute' && (
          <>
            <Link href="/draft-analysis?tab=attribute&sub=all" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>📏 体格・BMI黄金比</Link>
            <Link href="/draft-analysis?tab=attribute&sub=handedness" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'handedness' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>⚡ 投打タイプ（右投左打）</Link>
            <Link href="/draft-analysis?tab=attribute&sub=birth_month" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'birth_month' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🎂 早生まれ（1〜3月）不遇説</Link>
            <Link href="/draft-analysis?tab=attribute&sub=blood" className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap ${subCategory === 'blood' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>🩸 血液型×パフォーマンス</Link>
          </>
        )}
      </div>

      {/* 4. ハイライト発見バナー（UX向上） */}
      <div className="bg-amber-400 border-2 border-amber-500 rounded-2xl p-4 mb-6 shadow-md transform -rotate-0.5">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">💡</span>
          <div>
            <h3 className="font-black text-slate-950 text-sm md:text-base mb-1">
              {mainTab === 'roots' && '【ルーツ検証】「高卒スラッガー」と「大卒即戦力」の現在地'}
              {mainTab === 'round' && '【指名史検証】ドラフト1位・2位指名選手が占める主力を分析'}
              {mainTab === 'team' && '【球団編成検証】チームの核（エース・主砲）の自前育成比率'}
              {mainTab === 'attribute' && '【属性検証】体格（BMI）・誕生月・投打の組み合わせから探る黄金比'}
            </h3>
            <p className="text-xs text-slate-900 font-bold leading-relaxed">
              タブやサブメニューを切り替えることで、様々な文脈からプロ野球選手のルーツと活躍の相関関係を検証できます。
            </p>
          </div>
        </div>
      </div>

      {/* 5. エラーログまたはメインコンテンツ */}
      {fetchError ? (
        <div className="p-6 bg-red-50 border-2 border-red-300 rounded-2xl text-red-600 font-bold">
          データの取得に失敗しました。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          
          {/* 既存のデータベースから取得した実データ（またはUIモック検証エリア） */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 md:p-6 shadow-md">
            <h2 className="text-base md:text-lg font-black mb-4 bg-blue-600 text-white inline-block px-3 py-1 rounded-lg transform rotate-0.5 shadow-sm">
              📊 データ集計一覧：
              {mainTab === 'roots' && '経歴ルーツ'}
              {mainTab === 'round' && 'ドラフト順位別'}
              {mainTab === 'team' && '球団・育成分析'}
              {mainTab === 'attribute' && '属性分析'}
            </h2>

            {/* テーブル（モバイルファースト・横スクロール） */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-800 text-white text-xs md:text-sm">
                    <th className="p-3 rounded-l-xl font-bold">区分・項目</th>
                    <th className="p-3 font-bold text-right">該当選手数</th>
                    <th className="p-3 font-bold text-right">グループ合計本塁打</th>
                    <th className="p-3 font-bold text-right">グループ合計安打</th>
                    <th className="p-3 rounded-r-xl font-bold text-right">1人平均本塁打</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.length > 0 ? (
                    displayData.map((item, idx) => {
                      const rowTitle = item.route ? item.route : `${item.round}指名`;
                      return (
                        <tr key={idx} className="border-b-2 border-slate-100 hover:bg-slate-50 text-xs md:text-sm font-bold text-slate-700">
                          <td className="p-3 text-slate-900 font-black">{rowTitle}</td>
                          <td className="p-3 text-right">{item.players}人</td>
                          <td className="p-3 text-right text-amber-600 font-extrabold">{Number(item.hr).toLocaleString()}本</td>
                          <td className="p-3 text-right">{Number(item.hits).toLocaleString()}安打</td>
                          <td className="p-3 text-right text-blue-600 font-black text-base">{item.avghr}本</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 font-bold text-sm">
                        ⚙️ 「{mainTab} / {subCategory}」 のデータビューを順次紐付け準備中です！<br/>
                        上のタブをクリックして操作感や切り替えレスポンスをご確認ください。
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