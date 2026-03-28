import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; team?: string }>;
}) {
  const params = await searchParams;
  const query = params.query || '';
  const team = params.team || '';

  // Supabaseからデータを取得（検索条件を反映）
  let dbQuery = supabase
    .from('players')
    .select('player_id, player_name, team_name, position_detail');

  if (query) {
    dbQuery = dbQuery.ilike('player_name', `%${query}%`);
  }
  if (team) {
    dbQuery = dbQuery.eq('team_name', team);
  }

  const { data: players, error } = await dbQuery.limit(50); // 最初は50件表示

  const teams = [
    "阪神タイガース", "広島東洋カープ", "横浜DeNAベイスターズ", "読売ジャイアンツ", "東京ヤクルトスワローズ", "中日ドラゴンズ",
    "オリックス・バファローズ", "千葉ロッテマリーンズ", "福岡ソフトバンクホークス", "東北楽天ゴールデンイーグルス", "埼玉西武ライオンズ", "北海道日本ハムファイターズ"
  ];

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10 text-black">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-blue-900">NPB 選手データベース</h1>

        {/* 検索・絞り込みフォーム */}
        <form className="bg-white p-6 rounded-xl shadow-md mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            name="query"
            placeholder="選手名を入力..."
            defaultValue={query}
            className="border p-2 rounded w-full bg-white"
          />
          <select name="team" defaultValue={team} className="border p-2 rounded w-full bg-white">
            <option value="">全球団</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="submit" className="bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition">
            検索・絞り込み
          </button>
        </form>

        {/* 選手リスト */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {players?.map((player) => (
            <Link 
              key={player.player_id} 
              href={`/player/${player.player_id}`}
              className="block p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">{player.team_name}</p>
                  <h2 className="text-xl font-bold">{player.player_name}</h2>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                  {player.position_detail}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}