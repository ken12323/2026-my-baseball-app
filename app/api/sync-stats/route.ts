// app/api/sync-stats/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // ★元凶の無力化
  // 古いスクレイピング処理はPython (sync_team_stats.py) に移行したため無効化しました。
  // これが動くとデータベースが古い形式（7桁ID等）で再汚染されるため、処理をストップします。
  
  return NextResponse.json({ 
    success: true, 
    message: "This API is deprecated. Database is now updated via Python script." 
  });
}