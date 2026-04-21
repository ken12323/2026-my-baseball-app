'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// --- 1. 型定義 ---
type Period = 'today' | 'yesterday' | 'weekly' | 'season';
type Category = 'high_school' | 'university' | 'prev_team' | 'draft_year' | 'hometown';

interface PlayerSummary {
  id: any;
  name: string;
  hits: number;
  hr: number;
  team: string;
}

interface RankingRow {
  name: string;
  total_hits: number;
  total_hr: number;
  total_rbi: number;
  players: PlayerSummary[];
}

const CATEGORY_URL_MAP: Record<string, string> = {
  high_school: 'high_school',
  university: 'university',
  prev_team: 'previous_team',
  draft_year: 'draft',
  hometown: 'hometown'
};

// --- 2. メインのロジック部分 ---
function RankingList() {
  const searchParams = useSearchParams();
  const period = (searchParams.get('period') as Period) || 'season';
  const category = (searchParams.get('cat') as Category) || 'high_school';

  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayDate, setDisplayDate] = useState('');
  
  // ★ 追加：1軍/2軍の切り替え状態
  const [leagueType, setLeagueType] = useState<'1軍' | '2軍'>('1軍');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const getJSTDate = (offsetDay = 0) => {
          const d = new Date();
          d.setDate(d.getDate() + offsetDay);
          return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
        };

        const todayStr = getJSTDate(0);
        const yesterdayStr = getJSTDate(-1);
        const weekAgoStr = getJSTDate(-7);

        let targetQueryDate = todayStr;
        if (period === 'yesterday') targetQueryDate = yesterdayStr;
        setDisplayDate(period === 'season' ? '2026年 通算' : targetQueryDate);

        const stats: Record<string, RankingRow> = {};

        // ★ 追加：1軍/2軍のマスターデータを統合取得
        let playersData: any[] = [];
        if (leagueType === '2軍') {
          // 2軍の場合は、1軍選手(調整中等)と2軍専用選手の両方を取得して結合
          const [res1, res2] = await Promise.all([
            supabase.from('players').select('*'),
            supabase.from('farm_players').select('*')
          ]);
          const combined = [...(res1.data || []), ...(res2.data || [])];
          // IDで重複排除
          const map = new Map();
          combined.forEach(p => map.set(String(p.player_id).padStart(8, '0'), p));
          playersData = Array.from(map.values());
        } else {
          // 1軍の場合は通常通り
          const { data } = await supabase.from('players').select('*');
          playersData = data || [];
        }

        if (period === 'season') {
          // ★ 修正：リーグに応じて成績テーブルを切り替え
          const tableName = leagueType === '2軍' ? 'farm_batting_stats' : 'batting_stats';
          const { data: battingData, error } = await supabase.from(tableName).select('*').eq('年度', 2026);

          if (error && leagueType === '2軍') {
            console.warn('2軍の成績テーブルが見つかりません', error);
          }

          if (battingData && playersData.length > 0) {
            battingData.forEach((row) => {
              const bat = row as any; 
              const safeId = String(bat.player_id).padStart(8, '0');
              const player = playersData.find((p) => String(p.player_id).padStart(8, '0') === safeId);
              if (!player) return;

              let keys: string[] = [];
              if (category === 'high_school') keys.push(player.high_school || '海外/その他');
              else if (category === 'university' && player.university) keys.push(player.university);
              else if (category === 'prev_team') {
                [player.prev_team_1, player.prev_team_2, player.prev_team_3].forEach(t => t && keys.push(t));
              } else if (category === 'draft_year' && player.draft_year) keys.push(player.draft_year);
              else if (category === 'hometown') keys.push(player.hometown || '不明');

              keys.forEach(key => {
                if (!key || key === '-' || key === '未設定') return;
                const displayKey = category === 'draft_year' ? `${key}年指名` : key;
                if (!stats[key]) {
                  stats[key] = { name: displayKey, total_hits: 0, total_hr: 0, total_rbi: 0, players: [] };
                }
                
                const hits = Number(bat.安打) || 0;
                const hr = Number(bat.本塁打) || 0;
                const rbi = Number(bat.打点) || 0;

                stats[key].total_hits += hits;
                stats[key].total_hr += hr;
                stats[key].total_rbi += rbi;

                const pName = player.player_name || '不明';
                stats[key].players.push({
                  id: safeId,
                  name: pName,
                  hits: hits,
                  hr: hr,
                  team: player.team_name || '不明'
                });
              });
            });
          }
        } else {
          // ★ 修正：デイリー成績もリーグに応じてテーブルを切り替え
          const tableName = leagueType === '2軍' ? 'farm_daily_performance' : 'daily_performance';
          let query = supabase.from(tableName).select('*');
          if (period === 'today') query = query.eq('date', todayStr);
          else if (period === 'yesterday') query = query.eq('date', yesterdayStr);
          else if (period === 'weekly') query = query.gte('date', weekAgoStr);

          const { data: performance, error } = await query;
          
          if (error && leagueType === '2軍') {
            console.warn('2軍のデイリーテーブルが見つかりません', error);
          }

          if (performance && playersData.length > 0) {
            performance.forEach((perf) => {
              const safeId = String(perf.player_id).padStart(8, '0');
              const player = playersData.find((p) => String(p.player_id).padStart(8, '0') === safeId);
              if (!player) return;

              let keys: string[] = [];
              if (category === 'high_school') keys.push(player.high_school || '海外/その他');
              else if (category === 'university' && player.university) keys.push(player.university);
              else if (category === 'prev_team') {
                [player.prev_team_1, player.prev_team_2, player.prev_team_3].forEach(t => t && keys.push(t));
              } else if (category === 'draft_year' && player.draft_year) keys.push(player.draft_year);
              else if (category === 'hometown') keys.push(player.hometown || '不明');

              keys.forEach(key => {
                if (!key || key === '-' || key === '未設定') return;
                const displayKey = category === 'draft_year' ? `${key}年指名` : key;
                if (!stats[key]) {
                  stats[key] = { name: displayKey, total_hits: 0, total_hr: 0, total_rbi: 0, players: [] };
                }
                stats[key].total_hits += (Number(perf.h_hits) || 0);
                stats[key].total_hr += (Number(perf.h_hr) || 0);
                stats[key].total_rbi += (Number(perf.h_rbi) || 0);

                const pName = player.player_name || '不明';
                const pIdx = stats[key].players.findIndex(p => p.name === pName);
                if (pIdx === -1) {
                  stats[key].players.push({ 
                    id: safeId, 
                    name: pName, 
                    hits: Number(perf.h_hits) || 0, 
                    hr: Number(perf.h_hr) || 0, 
                    team: player.team_name || '不明'
                  });
                } else {
                  stats[key].players[pIdx].hits += (Number(perf.h_hits) || 0);
                  stats[key].players[pIdx].hr += (Number(perf.h_hr) || 0);
                }
              });
            });
          }
        }
        
        setRanking(Object.values(stats).sort((a, b) => b.total_hits - a.total_hits));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [period, category, leagueType]); // ★ leagueType を依存配列に追加

  return (
    <div className="max-w-4xl mx-auto">
      
      <div className="flex bg-slate-200 p-1.5 rounded-2xl mb-6 shadow-inner">
        <div className="flex-1 text-center py-3.5 rounded-xl text-sm font-black bg-white text-blue-900 shadow-sm flex items-center justify-center gap-2">
          <span className="text-lg">🌱</span> ルーツ別ランキング
        </div>
        <Link href="/ranking" className="flex-1 text-center py-3.5 rounded-xl text-sm font-black text-slate-500 hover:text-blue-900 transition-all flex items-center justify-center gap-2 hover:bg-slate-100/50">
          <span className="text-lg">🏆</span> NPB総合リーダーボード
        </Link>
      </div>

      {/* ★ 追加：1軍/2軍の切り替えタブ */}
      <div className="flex justify-center mb-6">
        <div className="bg-slate-200 p-1 rounded-2xl flex gap-1 shadow-inner">
          <button 
            onClick={() => setLeagueType('1軍')}
            className={`px-8 py-2.5 rounded-xl font-black text-sm transition-all ${leagueType === '1軍' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:bg-slate-300/50'}`}
          >
            1軍成績
          </button>
          <button 
            onClick={() => setLeagueType('2軍')}
            className={`px-8 py-2.5 rounded-xl font-black text-sm transition-all ${leagueType === '2軍' ? 'bg-white text-green-600 shadow-md' : 'text-slate-500 hover:bg-slate-300/50'}`}
          >
            2軍成績
          </button>
        </div>
      </div>

      {/* ★ 修正：選択中のリーグに応じてテーマカラー（枠線など）を切り替え */}
      <header className={`mb-6 bg-white p-6 rounded-2xl shadow-xl border-t-8 ${leagueType === '1軍' ? 'border-blue-900' : 'border-green-600'}`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className={`text-3xl font-black italic tracking-tighter leading-none mb-1.5 ${leagueType === '1軍' ? 'text-blue-900' : 'text-green-700'}`}>
              BASEBALL <span className="text-red-600">ROOTS</span> <span className="text-sm text-slate-400 font-bold ml-1 tracking-widest">{leagueType}</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-tight">出身校や地元など、あらゆる「ルーツ」からプロ野球選手の現在地を比較。</p>
          </div>
          <div className="text-right">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${leagueType === '1軍' ? 'text-blue-600' : 'text-green-600'}`}>{period} / {category}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{displayDate}</p>
          </div>
        </div>
        
        <nav className="flex flex-wrap gap-1.5 mt-6">
          {[{ id: 'high_school', n: '高校' }, { id: 'university', n: '大学' }, { id: 'prev_team', n: '前所属' }, { id: 'draft_year', n: 'ドラフト' }, { id: 'hometown', n: '出身地' }].map(c => (
            <Link key={c.id} href={`/?period=${period}&cat=${c.id}`} className={`px-4 py-2 rounded-lg text-[11px] font-black transition-all ${category === c.id ? (leagueType === '1軍' ? 'bg-blue-900 text-white shadow-lg' : 'bg-green-700 text-white shadow-lg') : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
              {c.n}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex bg-slate-100 p-1 rounded-xl">
          {(['today', 'yesterday', 'weekly', 'season'] as Period[]).map(p => (
            <Link key={p} href={`/?period=${p}&cat=${category}`} className={`flex-1 text-center py-2 rounded-lg text-[10px] font-black transition-all ${period === p ? (leagueType === '1軍' ? 'bg-white text-blue-900 shadow-sm' : 'bg-white text-green-800 shadow-sm') : 'text-slate-400 hover:text-slate-600'}`}>
              {p === 'today' ? '今日' : p === 'yesterday' ? '昨日' : p === 'weekly' ? '週間' : '通算'}
            </Link>
          ))}
        </div>
      </header>

      {loading ? (
        <div className={`text-center py-20 font-black animate-pulse ${leagueType === '1軍' ? 'text-blue-900' : 'text-green-800'}`}>データを集計中...</div>
      ) : ranking.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 text-center my-8">
          <div className="text-6xl mb-6 animate-bounce">⚾️</div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-4 tracking-tight">
            {period === 'today' ? '本日の試合データはまだ集計されていません' : '指定された期間のデータがありません'}
          </h2>
          <p className="text-sm md:text-base font-bold text-slate-500 mb-8 leading-relaxed">
            試合開始まで、<span className="text-blue-600 border-b-2 border-blue-200">昨日のヒーロー</span>や<br className="md:hidden" /><span className="text-blue-600 border-b-2 border-blue-200">今シーズンの通算ランキング</span>をチェックしよう！
          </p>
          <div className="flex flex-col md:flex-row justify-center gap-4">
            <Link href={`/?period=yesterday&cat=${category}`} className="bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-black py-4 px-8 rounded-xl transition-all shadow-sm">
              昨日の成績を見る
            </Link>
            <Link href={`/?period=season&cat=${category}`} className={`${leagueType === '1軍' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} text-white font-black py-4 px-8 rounded-xl transition-all shadow-md`}>
              通算成績を見る
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {ranking.map((item, index) => {
            const rawName = category === 'draft_year' ? item.name.replace('年指名', '') : item.name;
            const detailUrl = `/roots/${CATEGORY_URL_MAP[category]}/${encodeURIComponent(rawName)}`;

            return (
              <details key={item.name} className={`group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all ${leagueType === '1軍' ? 'hover:border-blue-300' : 'hover:border-green-300'}`}>
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <div className="flex items-center gap-5 flex-1">
                    <div className={`text-2xl font-black italic w-8 ${index < 3 ? (leagueType === '1軍' ? 'text-blue-600' : 'text-green-500') : 'text-slate-200'}`}>{index + 1}</div>
                    
                    <div className="group/name">
                      <h2 className={`text-xl font-bold text-slate-800 underline decoration-4 underline-offset-4 ${leagueType === '1軍' ? 'decoration-blue-100' : 'decoration-green-100'}`}>{item.name}</h2>
                    </div>
                  </div>
                  
                  <div className="flex gap-6 items-center">
                    <div className="text-right leading-none border-r pr-6 border-slate-100">
                      <p className="text-[10px] text-slate-400 font-black mb-1 uppercase">Hits</p>
                      <p className={`text-2xl font-black ${leagueType === '1軍' ? 'text-blue-900' : 'text-green-800'}`}>{item.total_hits}</p>
                    </div>
                    <div className="text-right leading-none pl-0">
                      <p className="text-[10px] text-slate-400 font-black mb-1 uppercase">HR</p>
                      <p className="text-2xl font-black text-red-600">{item.total_hr}</p>
                    </div>
                  </div>
                </summary>

                <div className="px-5 md:px-16 pb-6 pt-4 bg-slate-50 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">主な活躍選手</p>
                    <Link href={detailUrl} className={`text-[10px] font-black flex items-center gap-1 px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-sm ${leagueType === '1軍' ? 'text-blue-500 hover:text-blue-700 bg-blue-100/50' : 'text-green-600 hover:text-green-800 bg-green-100/50'}`}>
                      詳細ランキングを見る
                      <span className="text-xs">→</span>
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.players.filter(p => p.hits > 0).sort((a,b)=>b.hits - a.hits).map(p => (
                      <Link key={p.name} href={`/player/${p.id}`} className={`bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm text-xs flex items-center gap-2 transition-all group/item ${leagueType === '1軍' ? 'hover:border-blue-500 hover:bg-blue-50' : 'hover:border-green-500 hover:bg-green-50'}`}>
                        <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-500 font-bold">{p.team}</span>
                        <span className={`font-bold text-slate-700 underline decoration-2 underline-offset-4 ${leagueType === '1軍' ? 'group-hover/item:text-blue-600 decoration-blue-200' : 'group-hover/item:text-green-600 decoration-green-200'}`}>{p.name}</span>
                        <span className={`font-black ${leagueType === '1軍' ? 'text-blue-600' : 'text-green-600'}`}>{p.hits}H</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-900">
      <Suspense fallback={<div className="text-center py-20 text-blue-900 font-black">初期化中...</div>}>
        <RankingList />
      </Suspense>
      <footer className="mt-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.5em] pb-12 italic">
        © 2026 BASEBALL ROOTS ANALYTICS
      </footer>
    </main>
  );
}