import { createClient } from '@supabase/supabase-js';

// 1. Supabaseの接続設定（道具の準備）
// ※ 環境変数（.env.local）からURLとキーを読み込みます
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. 選手データを取得する関数（上で準備した supabase を使います）
export async function getPlayerFullStats(playerId: string) {
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('player_id', playerId)
    .single();

  const { data: firstStats } = await supabase
    .from('batting_stats')
    .select('*')
    .eq('player_id', playerId)
    .order('年度', { ascending: true });

  const { data: farmStats } = await supabase
    .from('farm_batting_stats')
    .select('*')
    .eq('player_id', playerId)
    .order('年度', { ascending: true });

  return { player, firstStats, farmStats };
}