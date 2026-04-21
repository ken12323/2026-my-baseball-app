import os
import re
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import time
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# --- 設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def parse_profile_text(text):
    return text.replace('\n', '').replace('\r', '').strip()

def scrape_farm_profiles():
    table_name = "farm_players"
    print(f"🚀 {table_name} (オイシックス・ハヤテ専用) のプロフィール拡充を開始します...")
    
    res = supabase.table(table_name).select("player_id, sportsnavi_id, player_name, birthday").execute()
    total_records = len(res.data)
    
    print(f"📊 DB接続確認: {table_name} テーブルには現在 {total_records} 件のデータがあります。")
    if total_records == 0:
        return

    # sportsnavi_idがあり、かつbirthdayが空の選手だけを抽出
    players = [p for p in res.data if p.get("sportsnavi_id") and not p.get("birthday")]
    
    if not players:
        print(f"✅ {table_name} に更新が必要な選手はいません（全員取得済み）。")
        return

    print(f"🔍 今回プロフィールを新規取得する対象者: {len(players)} 名")
    update_batch = []
    
    for p in players:
        sp_id = p["sportsnavi_id"]
        url = f"https://baseball.yahoo.co.jp/npb/player/{sp_id}/top"
        
        try:
            html = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(html.content, "html.parser")
            
            profile_data = {
                "player_id": p["player_id"]
            }
            
            # --- 1. ポジションの抽出 ---
            # 「12 捕手」のような文字列からポジションだけを確実に抜き出す
            for tag in soup.find_all(["p", "span", "div", "h1", "h2", "li"]):
                t = tag.text.strip()
                if len(t) <= 15: # 長い文章の誤爆を防ぐ
                    match = re.search(r'(投手|捕手|内野手|外野手)', t)
                    if match:
                        profile_data["position_detail"] = match.group(1)
                        break
            
            # --- 2. プロフィール項目の抽出（ハイブリッド両対応） ---
            pairs = []
            
            # パターンA: dl / dt / dd (Yahooの最新レイアウト)
            for dt in soup.find_all("dt"):
                dd = dt.find_next_sibling("dd")
                if dd:
                    pairs.append((dt.text, dd.text))
                    
            # パターンB: tr / th / td (旧レイアウトや表組み)
            for tr in soup.find_all("tr"):
                th = tr.find("th")
                td = tr.find("td")
                if th and td:
                    pairs.append((th.text, td.text))

            # ペアからデータを抽出
            for raw_label, raw_val in pairs:
                label = re.sub(r'\s+', '', raw_label) # "生 年 月 日" のような空白を念のため除去
                val = parse_profile_text(raw_val)
                
                if "出身地" in label:
                    profile_data["hometown"] = val
                elif "生年月日" in label:
                    match = re.match(r'([^（(]+)', val)
                    if match:
                        profile_data["birthday"] = match.group(1).strip()
                elif "身長" in label:
                    match = re.search(r'\d+', val)
                    if match:
                        profile_data["height"] = int(match.group())
                elif "体重" in label:
                    match = re.search(r'\d+', val)
                    if match:
                        profile_data["weight"] = int(match.group())
                elif "血液型" in label:
                    profile_data["blood_type"] = val
                elif "投打" in label:
                    profile_data["throws_bats"] = val
                elif "ドラフト" in label:
                    dy = re.search(r'(\d{4})年', val)
                    dr = re.search(r'(\d+)位', val)
                    if dy: profile_data["draft_year"] = int(dy.group(1))
                    if dr: profile_data["draft_rank"] = int(dr.group(1))
                elif "経歴" in label:
                    history = [h.strip() for h in re.split(r'[－\-]', val) if h.strip()]
                    if len(history) > 0: profile_data["high_school"] = history[0]
                    if len(history) > 1: profile_data["university"] = history[1]
                    if len(history) > 2: profile_data["prev_team_1"] = history[2]
                    if len(history) > 3: profile_data["prev_team_2"] = history[3]
            
            update_batch.append(profile_data)
            print(f"取得成功: {p['player_name']} (生年月日: {profile_data.get('birthday', '不明')})")
            time.sleep(1) # サーバー負荷軽減（YahooにBANされないための必須事項）
            
        except Exception as e:
            print(f"❌ 取得エラー ({p['player_name']}): {e}")

    # 一括アップデート（Upsert）
    if update_batch:
        for i in range(0, len(update_batch), 50):
            supabase.table(table_name).upsert(update_batch[i:i+50]).execute()
        print(f"🎉 {len(update_batch)} 名のプロフィール更新が完了しました！")

def main():
    # ★ 1軍(players)には絶対にアクセスしません ★
    scrape_farm_profiles()

if __name__ == "__main__":
    main()