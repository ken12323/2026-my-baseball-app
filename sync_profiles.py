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

def scrape_and_update_profiles(table_name):
    print(f"🚀 {table_name} のプロフィール拡充を開始します...")
    
    # ★修正箇所：Python版の正しいフィルター構文（.not_ と .is_）に変更
    res = supabase.table(table_name)\
        .select("player_id, sportsnavi_id, player_name")\
        .not_("sportsnavi_id", "is", "null")\
        .is_("birthday", "null")\
        .execute()
        
    players = res.data
    
    if not players:
        print(f"✅ {table_name} に更新が必要な選手はいません。")
        return

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
            
            # 1. ポジションの抽出
            for tag in soup.find_all(["p", "span", "div"]):
                t = tag.text.strip()
                if t in ["投手", "捕手", "内野手", "外野手"]:
                    profile_data["position_detail"] = t
                    break
            
            # 2. テーブルからの詳細データ抽出
            for tr in soup.find_all("tr"):
                th = tr.find("th")
                td = tr.find("td")
                if not th or not td: continue
                
                label = th.text.strip()
                val = parse_profile_text(td.text)
                
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
            time.sleep(1) # サーバー負荷軽減
            
        except Exception as e:
            print(f"❌ 取得エラー ({p['player_name']}): {e}")

    # 一括アップデート（Upsert）
    if update_batch:
        for i in range(0, len(update_batch), 50):
            supabase.table(table_name).upsert(update_batch[i:i+50]).execute()
        print(f"🎉 {len(update_batch)} 名のプロフィール更新が完了しました！")

def main():
    scrape_and_update_profiles("farm_players")
    scrape_and_update_profiles("players")

if __name__ == "__main__":
    main()