import os
import sys
import re
import requests
from bs4 import BeautifulSoup
import datetime
import time
from supabase import create_client, Client

# 🚀 既存の .env.local を読み込む
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# --- ⚙️ 設定エリア ---
# .env.local にある正しい変数名（SUPABASE_SERVICE_ROLE_KEY）を指定します
# ※GitHub側で SUPABASE_KEY と登録してしまった場合にも備えて、どちらでも動くように or で繋ぎます
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://wnzsahimcnxnxkkxfgdb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

ALL_YAHOO_TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376,
    "オイシックス": 806, "ハヤテ": 23879
}

def normalize_name(name):
    """名前の表記揺れ（空白、旧字体、外国人選手のイニシャル等）を吸収する"""
    if not name: return ""
    clean = re.sub(r'\s+', '', unicodedata.normalize('NFKC', name))
    # 旧字体の統一
    clean = clean.replace("﨑", "崎").replace("髙", "高").replace("濵", "浜").replace("澤", "沢").replace("邊", "辺").replace("櫻", "桜")
    # 外国人選手の「Ｄ．」などのイニシャルや「・」を消去
    clean = re.sub(r'^[Ａ-ＺA-Zぁ-んァ-ヶ][．\.]', '', clean)
    clean = clean.replace("・", "")
    return clean

def refresh_linkage():
    print("🔄 【1軍(players)・2軍(farm_players)両対応】ID紐付けを再実行します...")

    db_players = {}

    # 1. 1軍マスター (players) の読み込み
    res_main = supabase.table("players").select("player_id, player_name").execute()
    for p in res_main.data:
        clean_n = normalize_name(p["player_name"])
        db_players[clean_n] = {"id": p["player_id"], "table": "players"}

    # 2. ファーム専用マスター (farm_players) の読み込み（★ここが前回抜けていた部分です）
    res_farm = supabase.table("farm_players").select("player_id, player_name").execute()
    for p in res_farm.data:
        clean_n = normalize_name(p["player_name"])
        if clean_n not in db_players:
            db_players[clean_n] = {"id": p["player_id"], "table": "farm_players"}

    print(f"📥 データベースから合計 {len(db_players)} 名の選手情報を読み込みました。")
    updated_count = 0
    missing_players = []

    # 3. Yahooのページから最新のスポナビIDを取得して照合
    for team_name, team_id in ALL_YAHOO_TEAMS.items():
        url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/players"
        try:
            res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(res.content, "html.parser")
            
            for a in soup.find_all("a", href=re.compile(r"/npb/player/(\d+)/top")):
                match = re.search(r"/npb/player/(\d+)/top", a["href"])
                if not match: continue
                
                yahoo_id = match.group(1)
                texts = list(a.stripped_strings)
                if not texts: continue
                
                raw_name = ""
                for t in texts:
                    if re.match(r'^[\d\.]+$', t): continue
                    raw_name = t
                    break
                
                clean_name = normalize_name(raw_name)

                # 照合と更新
                if clean_name in db_players:
                    target_info = db_players[clean_name]
                    # 所属している正しいテーブルを更新
                    supabase.table(target_info["table"]).update({"sportsnavi_id": yahoo_id}).eq("player_id", target_info["id"]).execute()
                    updated_count += 1
                else:
                    # 両方のテーブルを探しても本当にいない場合（新入団選手の登録漏れなど）
                    missing_players.append(f"{raw_name} ({team_name})")

        except Exception as e:
            print(f"❌ {team_name}の取得中にエラー: {e}")

    print(f"✨ 完了！ 1軍・2軍合わせて合計 {updated_count} 名のスポナビIDを完璧に紐付けました。")
    
    if missing_players:
        print("\n⚠️ 以下の選手は、1軍・2軍のどちらのデータベースにも存在しませんでした:")
        for mp in missing_players:
            print(f" - {mp}")

if __name__ == "__main__":
    refresh_linkage()