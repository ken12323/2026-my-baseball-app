import { supabase } from '@/lib/supabase';

interface PlayerDetail {
  name: string;
  hits: number;
  hr: number;
}

interface RankingRow {
  high_school: string;
  total_hits: number;
  total_hr: number;
  total_rbi: number;
  players: PlayerDetail[];
}

export const revalidate = 0;

export default async function Home() {
  // 1. まず、DBにある最新の日付を1件だけ取得して「表示対象日」を決める
  const { data: latestEntry } = await supabase
    .from('daily_performance')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);

  const targetDate = latestEntry?.[0]?.date || "";

  // 2. その日付のデータだけを取得
  const { data: performance } = await supabase
    .from('daily_performance')
    .select('*')
    .eq('date', targetDate);

  const { data: players } = await supabase.from('players').select('player_id, name, high_school');

  // 3. 集計
  const schoolStats: Record<string, RankingRow> = {};

  if (performance && players) {
    performance.forEach((perf) => {
      const player = players.find((p) => String(p.player_id) === String(perf.player_id));
      if (!player || !player.high_school) return;

      const school = player.high_school;
      if (!schoolStats[school]) {
        schoolStats[school] = {
          high_school: school,
          total_hits: 0,
          total_hr: 0,
          total_rbi: 0,
          players: [],
        };
      }

      schoolStats[school].total_hits += perf.h_hits;
      schoolStats[school].total_hr += perf.h_hr;
      schoolStats[school].total_rbi += perf.h_rbi;

      // 誰が打ったかの内訳を追加
      schoolStats[school].players.push({
        name: player.name,
        hits: perf.h_hits,
        hr: perf.h_hr
      });
    });
  }

  const ranking = Object.values(schoolStats).sort((a, b) => b.total_hits - a.total_hits);

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b-2 border-blue-900 pb-4">
          <h1 className="text-2xl font-bold text-blue-900">
            ⚾️ プロ野球 出身校別デイリーランキング
          </h1>
          <div className="flex justify-between items-end mt-2">
            <p className="text-slate-600 text-sm">本日の全試合の合計成績（自動更新）</p>
            {targetDate && (
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                対象日: {targetDate}
              </span>
            )}
          </div>
        </header>

        <div className="space-y-3">
          {ranking.map((item, index) => (
            <details key={item.high_school} className="group bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 list-none">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-black text-slate-300 w-8">{index + 1}</span>
                  <h2 className="text-lg font-bold text-slate-800">{item.high_school}</h2>
                </div>
                <div className="flex gap-8 text-right">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Hits</p>
                    <p className="text-xl font-black text-blue-600">{item.total_hits}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">HR</p>
                    <p className="text-xl font-black text-red-500">{item.total_hr}</p>
                  </div>
                </div>
              </summary>
              
              <div className="px-12 pb-4 pt-2 bg-slate-50 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 mb-2 italic">ー 活躍した選手の内訳</p>
                <div className="flex flex-wrap gap-2">
                  {item.players.map((p, i) => (
                    <div key={i} className="bg-white border border-slate-200 px-3 py-1 rounded shadow-sm text-sm">
                      <span className="font-bold text-slate-700">{p.name}</span>
                      <span className="ml-2 text-blue-600 font-medium">{p.hits}H</span>
                      {p.hr > 0 && <span className="ml-1 text-red-500 font-medium">({p.hr}HR)</span>}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
        
        {ranking.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            データがありません。スクレイピングを実行してください。
          </div>
        )}
      </div>
    </main>
  );
}