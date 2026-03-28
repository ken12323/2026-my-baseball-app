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
  players: PlayerDetail[]; // 誰が打ったかのリストを追加
}

export const revalidate = 0; // 常に最新データを取得するように変更

export default async function Home() {
  const { data: performance } = await supabase.from('daily_performance').select('*');
  const { data: players } = await supabase.from('players').select('player_id, name, high_school');

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
        players: [],
      };
    }

    schoolStats[school].total_hits += perf.h_hits;
    schoolStats[school].total_hr += perf.h_hr;
    schoolStats[school].total_rbi += perf.h_rbi;

    // 安打を打った選手をリストに追加
    if (perf.h_hits > 0 || perf.h_hr > 0) {
      schoolStats[school].players.push({
        name: player.name,
        hits: perf.h_hits,
        hr: perf.h_hr,
      });
    }
  });

  const ranking = Object.values(schoolStats).sort((a, b) => b.total_hits - a.total_hits);

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-black text-slate-900 border-l-8 border-blue-600 pl-4">
            BASEBALL SCHOOL RANKING
          </h1>
          <p className="text-slate-500 mt-2 ml-3">本日のプロ野球 出身校別安打数まとめ</p>
        </header>

        <div className="space-y-4">
          {ranking.map((item, index) => (
            <details key={item.high_school} className="group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 list-none">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black text-slate-300 w-8">#{index + 1}</span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{item.high_school}</h2>
                    <p className="text-sm text-slate-400">{item.players.length}名が活躍</p>
                  </div>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold">Hits</p>
                    <p className="text-2xl font-black text-blue-600">{item.total_hits}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold">HR</p>
                    <p className="text-2xl font-black text-red-500">{item.total_hr}</p>
                  </div>
                </div>
              </summary>
              
              <div className="px-14 pb-4 pt-2 bg-slate-50 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 mb-2">活躍した選手：</p>
                <div className="flex flex-wrap gap-2">
                  {item.players.map((p, i) => (
                    <span key={i} className="bg-white border border-slate-200 px-3 py-1 rounded-full text-sm shadow-sm">
                      <span className="font-bold text-slate-700">{p.name}</span>
                      <span className="ml-2 text-slate-400 text-xs">{p.hits}H {p.hr > 0 && ` / ${p.hr}HR`}</span>
                    </span>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}