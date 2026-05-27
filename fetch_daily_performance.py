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
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://wnzsahimcnxnxkkxfgdb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def convert_ip(ip_str):
    if not ip_str or ip_str == '-': return 0.0
    try:
        ip_str = ip_str.replace(' ', '')
        if '1/3' in ip_str: return float(ip_str.replace('1/3', '')) + 0.1
        if '2/3' in ip_str: return float(ip_str.replace('2/3', '')) + 0.2
        return float(ip_str)
    except: return 0.0

def safe_int(val_str):
    if not val_str or val_str == '-': return 0
    try: return int(re.sub(r'[^\d]', '', val_str))
    except: return 0

def fetch_daily_performance(target_date=None):
    if target_date is None:
        target_date = datetime.date.today().strftime('%Y-%m-%d')
    
    print(f"📅 【{target_date}】 の試合結果を取得開始します...")

    res_main = supabase.table("players").select("player_id, sportsnavi_id").execute()
    res_farm = supabase.table("farm_players").select("player_id, sportsnavi_id").execute()
    
    yahoo_to_npb_map = {}
    for p in (res_main.data + res_farm.data):
        if p.get("sportsnavi_id"):
            yahoo_to_npb_map[str(p["sportsnavi_id"]).strip()] = str(p["player_id"])
            
    game_links = {} # ⚾️ URLをキーにして、1軍(1)か2軍(2)かを保存する

    headers = {"User-Agent": "Mozilla/5.0"}
    
    # 🌟 1. 【1軍】の試合URLを取得
    url_1 = f"https://baseball.yahoo.co.jp/npb/schedule/first/all?date={target_date}"
    res_1 = requests.get(url_1, headers=headers)
    soup_1 = BeautifulSoup(res_1.text, "html.parser")
    for a in soup_1.find_all("a", href=re.compile(r'/npb/game/\d+')):
        if a.find_parent("table"): continue
        match = re.search(r'/npb/game/(\d+)', a['href'])
        if match: game_links[f"https://baseball.yahoo.co.jp/npb/game/{match.group(1)}/stats"] = 1

    # 🌟 2. 【2軍】の試合URLを取得
    url_2 = f"https://baseball.yahoo.co.jp/npb/schedule/farm/all?date={target_date}"
    res_2 = requests.get(url_2, headers=headers)
    soup_2 = BeautifulSoup(res_2.text, "html.parser")
    for a in soup_2.find_all("a", href=re.compile(r'/npb/game/\d+')):
        if a.find_parent("table"): continue
        match = re.search(r'/npb/game/(\d+)', a['href'])
        if match: game_links[f"https://baseball.yahoo.co.jp/npb/game/{match.group(1)}/stats"] = 2

    if not game_links:
        print("   ※この日に予定されている試合、または結果が見つかりませんでした。")
        return

    print(f"🏟️ 1軍・2軍合わせて 全 {len(game_links)} 試合のスコアボードを解析します...")
    
    daily_data_1 = {}
    daily_data_2 = {}

    for game_url, league in game_links.items():
        time.sleep(1)
        try:
            g_res = requests.get(game_url, headers=headers)
            g_soup = BeautifulSoup(g_res.text, "html.parser")
            
            # リーグに応じて保存先を振り分ける
            target_dict = daily_data_1 if league == 1 else daily_data_2

            for table in g_soup.find_all("table"):
                th_texts = [th.get_text(strip=True) for th in table.find_all("th")]
                if not th_texts: continue
                
                # --- 🏏 打者 ---
                if "安打" in th_texts and "打点" in th_texts and "投球回" not in th_texts:
                    idx_h = th_texts.index("安打") if "安打" in th_texts else -1
                    idx_hr = th_texts.index("本塁打") if "本塁打" in th_texts else -1
                    for tr in table.find("tbody").find_all("tr"):
                        tds = tr.find_all("td")
                        if not tds: continue
                        a_tag = tr.find("a", href=re.compile(r'/player/\d+'))
                        if not a_tag: continue
                        yahoo_id = re.search(r'/player/(\d+)', a_tag['href']).group(1)
                        player_name = a_tag.get_text(strip=True)
                        actual_player_id = yahoo_to_npb_map.get(yahoo_id)
                        if not actual_player_id: continue
                        
                        hits = safe_int(tds[idx_h].get_text()) if idx_h != -1 else 0
                        hr = safe_int(tds[idx_hr].get_text()) if idx_hr != -1 else 0
                        tb = hits + (hr * 3)
                        
                        if actual_player_id not in target_dict:
                            target_dict[actual_player_id] = {
                                "player_id": actual_player_id, "sportsnavi_id": yahoo_id,
                                "player_name": player_name, "date": target_date,
                                "b_hits": hits, "b_hr": hr, "b_tb": tb,
                                "p_k": 0, "p_ip": 0.0, "p_w": 0, "p_hld": 0, "p_sv": 0
                            }
                        else:
                            target_dict[actual_player_id]["b_hits"] += hits
                            target_dict[actual_player_id]["b_hr"] += hr
                            target_dict[actual_player_id]["b_tb"] += tb

                # --- ⚾️ 投手 ---
                elif "投球回" in th_texts and ("三振" in th_texts or "奪三振" in th_texts):
                    idx_ip = th_texts.index("投球回")
                    idx_k = th_texts.index("奪三振") if "奪三振" in th_texts else th_texts.index("三振")
                    for tr in table.find("tbody").find_all("tr"):
                        tds = tr.find_all("td")
                        if not tds: continue
                        a_tag = tr.find("a", href=re.compile(r'/player/\d+'))
                        if not a_tag: continue
                        yahoo_id = re.search(r'/player/(\d+)', a_tag['href']).group(1)
                        player_name = a_tag.get_text(strip=True)
                        actual_player_id = yahoo_to_npb_map.get(yahoo_id)
                        if not actual_player_id: continue
                        
                        ip_val = convert_ip(tds[idx_ip].get_text(strip=True))
                        k_val = safe_int(tds[idx_k].get_text())
                        row_text = tr.get_text()
                        w_val = 1 if "○" in row_text else 0
                        sv_val = 1 if "S" in row_text else 0
                        hld_val = 1 if "H" in row_text else 0
                        
                        if actual_player_id not in target_dict:
                            target_dict[actual_player_id] = {
                                "player_id": actual_player_id, "sportsnavi_id": yahoo_id,
                                "player_name": player_name, "date": target_date,
                                "b_hits": 0, "b_hr": 0, "b_tb": 0,
                                "p_k": k_val, "p_ip": ip_val, "p_w": w_val, "p_hld": hld_val, "p_sv": sv_val
                            }
                        else:
                            target_dict[actual_player_id]["p_k"] += k_val
                            target_dict[actual_player_id]["p_ip"] += ip_val
                            target_dict[actual_player_id]["p_w"] = max(target_dict[actual_player_id]["p_w"], w_val)
                            target_dict[actual_player_id]["p_hld"] = max(target_dict[actual_player_id]["p_hld"], hld_val)
                            target_dict[actual_player_id]["p_sv"] = max(target_dict[actual_player_id]["p_sv"], sv_val)

        except Exception as e:
            print(f"   ⚠️ 試合データ取得エラー ({game_url}): {e}")

    # 🌟 3. 保存処理（1軍と2軍でテーブルを分ける）
    records_1 = list(daily_data_1.values())
    records_2 = list(daily_data_2.values())
    
    if records_1:
        print(f"🚀 【1軍】 {len(records_1)} 名の選手データを保存します...")
        for i in range(0, len(records_1), 100):
            chunk = records_1[i:i+100]
            supabase.table("daily_performance").upsert(chunk, on_conflict="player_id,date").execute()
    
    if records_2:
        print(f"🚀 【2軍】 {len(records_2)} 名の選手データを保存します...")
        for i in range(0, len(records_2), 100):
            chunk = records_2[i:i+100]
            supabase.table("farm_daily_performance").upsert(chunk, on_conflict="player_id,date").execute()

    print(f"🎉 完了！ 1軍: {len(records_1)}件 / 2軍: {len(records_2)}件 のデータを保存しました！\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fetch_daily_performance(sys.argv[1])
    else:
        fetch_daily_performance()