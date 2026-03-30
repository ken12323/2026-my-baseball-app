import { supabase } from '@/lib/supabase';
import Link from 'next/link';

// 型の定義
type Period = 'today' | 'yesterday' | 'weekly' | 'season';
type Category = 'high_school' | 'university' | 'prev_team' | 'draft_year' | 'hometown';

interface RankingRow {
  name: string;
  total_hits: number;
  total_hr: number;
  total_rbi: number;
  players: { name: string, hits: number, hr: number, team: string }[];
}

export const revalidate = 0;

// 【修正ポイント】searchParams を Promise として受け取る
export default async function Home(props: { 
  searchParams: Promise<{ period?: Period, cat?: Category }> 
}) {
  // 1. searchParams を await して中身を取り出す（Next.js 15対策）
  const resolvedParams = await props.searchParams;
  const period = resolvedParams.period || 'today';
  const category = resolvedParams.cat || 'high_school';

  // 2. 日付の計算
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
  const todayStr = jstNow.toISOString().split('T')[0];
  
  const yesterday = new Date(jstNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const weekAgo = new Date(jstNow);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  let targetDate = todayStr;
  if (period === 'yesterday') targetDate = yesterdayStr;

  // 3. データ取得
  let query = supabase.from('daily_performance').select('*');
  if (period === 'today') query = query.eq('date', todayStr);
  else if (period === 'yesterday') query = query.eq('date', yesterdayStr);
  else if (period === 'weekly') query = query.gte('date', weekAgoStr);

  const [{ data: performance }, { data: players }] = await Promise.all([
    query,
    supabase.from('players').select('*')
  ]);

  // 4. 集計
  const stats: Record<string, RankingRow> = {};
  if (performance && players) {
    performance.forEach((perf) => {
      const player = players.find((p) => String(p.player_id) === String(perf.player_id));
      if (!player) return;

      let keys: string[] = [];
      
      // カテゴリー別のキー抽出（外国人対応 & 全経歴対応）
      if (category === 'high_school') {
        keys.push(player.high_school || '経歴なし(外国人/中退など)');
      } else if (category === 'university') {
        if (player.university) keys.push(player.university);
      } else if (category === 'prev_team') {
        // A-B-Cすべての経歴をカウント対象にする
        if (player.prev_team_1) keys.push(player.prev_team_1);
        if (player.prev_team_2) keys.push(player.prev_team_2);
        if (player.prev_team_3) keys.push(player.prev_team_3);
      } else if (category === 'draft_year') {
        if (player.draft_year) keys.push(`${player.draft_year}年指名`);
      } else if (category === 'hometown') {
        keys.push(player.hometown || '不明/海外');
      }

      keys.forEach(key => {
        if (!key || key === '-' || key === '未設定') return;
        if (!stats[key]) {
          stats[key] = { name: key, total_hits: 0, total_hr: 0, total_rbi: 0, players: [] };
        }
        stats[key].total_hits += perf.h_hits;
        stats[key].total_hr += perf.h_hr;
        stats[key].total_rbi += perf.h_rbi;

        const pName = player.player_name || player.name;
        const pIdx = stats[key].players.findIndex(p => p.name === pName);
        if (pIdx === -1) {
          stats[key].players.push({ name: pName, hits: perf.h_hits, hr: perf.h_hr, team: player.team_name });
        } else {
          stats[key].players[pIdx].hits += perf.h_hits;
          stats[key].players[pIdx].hr += perf.h_hr;
        }
      });
    });
  }

  const ranking = Object.values(stats).sort((a, b) => b.total_hits - a.total_hits);

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6 bg-white p-6 rounded-2xl shadow-xl border-t-8 border-blue-900">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-black text-blue-900 italic tracking-tighter">
              BASEBALL <span className="text-red-600">ROOTS</span>
            </h1>
            <div className="text-right">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                {period} / {category}
              </p>
              <p className="text-[10px] text-slate-400 font-bold mt-1">
                {period === 'season' ? '通算全データ' : targetDate}
              </p>
            </div>
          </div>
          
          <nav className="flex flex-wrap gap-1.5">
            {[
              { id: 'high_school', n: '高校' },
              { id: 'university', n: '大学' },
              { id: 'prev_team', n: '全前所属' },
              { id: 'draft_year', n: 'ドラフト' },
              { id: 'hometown', n: '出身地' }
            ].map(c => (
              <Link key={c.id} href={`/?period=${period}&cat=${c.id}`} className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${category === c.id ? 'bg-blue-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                {c.n}
              </Link>
            ))}
          </nav>

          <div className="mt-4 flex bg-slate-100 p-1 rounded-xl">
            {(['today', 'yesterday', 'weekly', 'season'] as Period[]).map(p => (
              <Link key={p} href={`/?period=${p}&cat=${category}`} className={`flex-1 text-center py-2 rounded-lg text-[10px] font-black uppercase transition-all ${period === p ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {p === 'today' ? '今日' : p === 'yesterday' ? '昨日' : p === 'weekly' ? '週間' : '通算'}
              </Link>
            ))}
          </div>
        </header>

        <div className="space-y-3">
          {ranking.map((item, index) => (
            <details key={item.name} className="group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:border-blue-300 transition-colors">
              <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                <div className="flex items-center gap-5">
                  <div className={`text-2xl font-black italic w-8 ${index < 3 ? 'text-blue-600' : 'text-slate-200'}`}>{index + 1}</div>
                  <h2 className="text-lg font-bold text-slate-800">{item.name}</h2>
                </div>
                <div className="flex gap-6 items-center">
                  <div className="text-right leading-none">
                    <p className="text-[10px] text-slate-400 font-black mb-1 uppercase">Hits</p>
                    <p className="text-2xl font-black text-blue-900">{item.total_hits}</p>
                  </div>
                  <div className="text-right leading-none border-l border-slate-100 pl-6">
                    <p className="text-[10px] text-slate-400 font-black mb-1 uppercase">HR</p>
                    <p className="text-2xl font-black text-red-600">{item.total_hr}</p>
                  </div>
                </div>
              </summary>
              <div className="px-16 pb-6 pt-2 bg-slate-50 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 mb-3 tracking-widest uppercase">Contributing Players</p>
                <div className="flex flex-wrap gap-2">
                  {item.players.sort((a,b)=>b.hits - a.hits).map(p => (
                    <div key={p.name} className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm text-xs flex items-center gap-2">
                      <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-500 font-bold">{p.team}</span>
                      <span className="font-bold text-slate-700">{p.name}</span>
                      <span className="text-blue-600 font-black">{p.hits}H</span>
                      {p.hr > 0 && <span className="text-red-500 font-black">{p.hr}HR</span>}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}

          {ranking.length === 0 && (
            <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-slate-400 text-sm font-bold">
                データがありません（対象：{period === 'season' ? '通算' : targetDate}）
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href={`/?period=season&cat=${category}`} className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold">
                  通算成績を表示してみる
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}