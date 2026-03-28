import { supabase } from '@/lib/supabase';

// データの型定義
interface RankingRow {
  high_school: string;
  total_hits: number;
  total_hr: number;
  total_rbi: number;
  player_count: number;
}

export const revalidate = 3600; // 1時間ごとにページを再生成（キャッシュ有効化）

export default async function Home() {
  // 1. Supabaseから「今日の全成績」と「選手情報」を取得
  // 本来は結合(Join)が理想ですが、分かりやすく2回に分けて取得してプログラムで合体させます
  const { data: performance } = await supabase.from('daily_performance').select('*');
  const { data: players } = await supabase.from('players').select('player_id, high_school');

  // 2. データを高校ごとに集計する
  const schoolStats: Record<string, RankingRow> = {};

  performance?.forEach((perf) => {
    const player = players?.find((p) => p.player_id === perf.player_id);
    if (!player || !player.high_school) return;

    const school = player.high_school;

    if (!schoolStats[school]) {
      schoolStats[school] = {
        high_school: school,
        total_hits: 0,
        total_hr: 0,
        total_rbi: 0,
        player_count: 0, // その高校から何人安打が出たか（任意）
      };
    }

    schoolStats[school].total_hits += perf.h_hits;
    schoolStats[school].total_hr += perf.h_hr;
    schoolStats[school].total_rbi += perf.h_rbi;
  });

  // 3. 安打数順に並び替え
  const ranking = Object.values(schoolStats).sort((a, b) => b.total_hits - a.total_hits);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">
            ⚾️ プロ野球 出身校別デイリーランキング
          </h1>
          <p className="text-gray-600">本日の全試合の合計成績を集計しています</p>
        </header>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-blue-900 text-white">
              <tr>
                <th className="px-6 py-4">順位</th>
                <th className="px-6 py-4">出身校</th>
                <th className="px-6 py-4 text-center">安打</th>
                <th className="px-6 py-4 text-center">本塁打</th>
                <th className="px-6 py-4 text-center">打点</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ranking.map((item, index) => (
                <tr key={item.high_school} className="hover:bg-blue-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-lg text-gray-700">
                    {index + 1}位
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {item.high_school}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-blue-600">
                    {item.total_hits}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-red-500">
                    {item.total_hr}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">
                    {item.total_rbi}
                  </td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    本日の試合データはまだありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <footer className="mt-8 text-center text-sm text-gray-400">
          Data provided by Yahoo! Japan Sports / Scraped automatically
        </footer>
      </div>
    </main>
  );
}