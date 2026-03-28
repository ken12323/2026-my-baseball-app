import { supabase } from '@/lib/supabase';

interface RankingRow {
  high_school: string;
  total_hits: number;
  total_hr: number;
  total_rbi: number;
}

// 常に最新データを取得する設定
export const revalidate = 0;

export default async function Home() {
  // 1. Supabaseからデータを取得
  const { data: performance, error: perfError } = await supabase.from('daily_performance').select('*');
  const { data: players, error: playerError } = await supabase.from('players').select('player_id, high_school');

  // 2. データを高校ごとに集計
  const schoolStats: Record<string, RankingRow> = {};

  if (performance && players) {
    performance.forEach((perf) => {
      // player_id が一致する選手を探す
      const player = players.find((p) => String(p.player_id) === String(perf.player_id));
      if (!player || !player.high_school) return;

      const school = player.high_school;

      if (!schoolStats[school]) {
        schoolStats[school] = {
          high_school: school,
          total_hits: 0,
          total_hr: 0,
          total_rbi: 0,
        };
      }

      schoolStats[school].total_hits += (perf.h_hits || 0);
      schoolStats[school].total_hr += (perf.h_hr || 0);
      schoolStats[school].total_rbi += (perf.h_rbi || 0);
    });
  }

  // 安打数順に並び替え
  const ranking = Object.values(schoolStats).sort((a, b) => b.total_hits - a.total_hits);

  return (
    <main className="min-h-screen bg-white p-4 md:p-8 text-slate-900">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b-2 border-blue-900 pb-4">
          <h1 className="text-2xl font-bold text-blue-900">
            ⚾️ プロ野球 出身校別デイリーランキング
          </h1>
          <p className="text-slate-600 text-sm mt-1">本日の全試合の合計成績（自動更新）</p>
        </header>

        {/* 診断用メッセージ（データがない場合のみ表示） */}
        {ranking.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6 text-sm text-amber-800">
            <p className="font-bold">⚠️ データが表示されない原因のヒント:</p>
            <ul className="list-disc ml-5 mt-1">
              <li>DBの成績データ数: {performance?.length || 0} 件</li>
              <li>登録選手数: {players?.length || 0} 件</li>
              <li>{performance?.length === 0 ? "今日の試合データがまだSupabaseに保存されていません。GitHub Actionsのログを確認してください。" : "成績データはありますが、選手名簿（playersテーブル）のIDと一致していません。"}</li>
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200">
                <th className="px-4 py-3 font-bold">順位</th>
                <th className="px-4 py-3 font-bold">出身校</th>
                <th className="px-4 py-3 text-center font-bold">安打</th>
                <th className="px-4 py-3 text-center font-bold">本塁打</th>
                <th className="px-4 py-3 text-center font-bold">打点</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((item, index) => (
                <tr key={item.high_school} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-4 text-slate-500">{index + 1}位</td>
                  <td className="px-4 py-4 font-bold">{item.high_school}</td>
                  <td className="px-4 py-4 text-center font-bold text-blue-600 text-lg">{item.total_hits}</td>
                  <td className="px-4 py-4 text-center font-bold text-red-500">{item.total_hr}</td>
                  <td className="px-4 py-4 text-center text-slate-600">{item.total_rbi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}