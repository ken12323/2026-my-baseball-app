import os
from supabase import create_client, Client
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# --- 設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("📊 データベース検証を開始します...\n")

# 誕生日がNullではない（取得成功した）選手を5名ピックアップ
res = supabase.table("farm_players").select(
    "player_name, position_detail, birthday, height, weight, throws_bats, draft_year, draft_rank, high_school, university, prev_team_1, prev_team_2"
).not_("birthday", "is", "null").limit(5).execute()

if not res.data:
    print("⚠️ プロフィールが登録されているデータが見つかりません。")
else:
    print(f"✅ プロフィールが登録されたデータを {len(res.data)} 件サンプリングしました：\n")
    for p in res.data:
        print(f"👤 {p.get('player_name')} ({p.get('position_detail', '不明')})")
        print(f"  - 生年月日: {p.get('birthday')}")
        print(f"  - 体格: {p.get('height')}cm / {p.get('weight')}kg")
        print(f"  - 投打: {p.get('throws_bats')}")
        
        # ドラフト情報の構築
        draft_str = "不明"
        if p.get('draft_year'):
            draft_str = f"{p.get('draft_year')}年 {p.get('draft_rank', '')}位"
        print(f"  - ドラフト: {draft_str}")
        
        # 経歴をハイフンで結合して表示
        history = [p.get('high_school'), p.get('university'), p.get('prev_team_1'), p.get('prev_team_2')]
        history_str = " － ".join([h for h in history if h])
        print(f"  - 経歴: {history_str}")
        print("-" * 40)