import os
import sys
import re
import requests
from bs4 import BeautifulSoup
import datetime
import time
from supabase import create_client, Client

# --- ⚙️ 設定エリア ---
SUPABASE_URL = "https://wnzsahimcnxnxkkxfgdb.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def convert_ip(ip_str):
    """投球回（例: 7 1/3）を数値（7.1）に変換"""
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
    # 日付指定がなければ「今日」をターゲットにする
    if target_date is None:
        target_date = datetime.date.today().strftime('%Y-%m-%d')
    
    print(f"📅 【{target_date}】 の試合結果を取得開始します...")

    # 選手マスターを取得して、スポナビID → NPB公式ID(player_id) の変換辞書を作る
    print("📋 選手マスターからID変換マップを作成中...")
    res_main = supabase.table("players").select("player_id, sportsnavi_id").execute()
    res_farm = supabase.table("farm_players").select("player_id, sportsnavi_id").execute()
    
    yahoo_to_npb_map = {}
    for p in (res_main.data + res_farm.data):
        if p.get("sportsnavi_id"):
            yahoo_to_npb_map[str(p["sportsnavi_id"]).strip()] = str(p["player_id"])
    
    # 1. 指定日の試合一覧URLを取得
    schedule_url = f"https://baseball.yahoo.co.jp/npb/schedule/first/all?date={target_date}"
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(schedule_url, headers=headers)
    soup = BeautifulSoup(res.text, "html.parser")
    
    game_links = []
    # 試合IDを抽出して確実に「stats（成績詳細）」ページへのリンクを生成する
    for a in soup.find_all("a", href=re.compile(r'/npb/game/\d+')):
        # 週間カレンダー部分（表組み）のリンクは無視する
        if a.find_parent("table"):
            continue

        match = re.search(r'/npb/game/(\d+)', a['href'])
        if match:
            game_id = match.group(1)
            stats_url = f"https://baseball.yahoo.co.jp/npb/game/{game_id}/stats"
            game_links.append(stats_url)
            
    game_links = list(set(game_links)) # 重複排除
    
    if not game_links:
        print("   ※この日に予定されている試合、または結果が見つかりませんでした。")
        return

    print(f"🏟️ 全 {len(game_links)} 試合のスコアボードを解析します...")
    
    daily_data = {}

    # 2. 各試合のスコアボードを巡回
    for game_url in game_links:
        time.sleep(1) # サーバー負荷軽減
        try:
            g_res = requests.get(game_url, headers=headers)
            g_soup = BeautifulSoup(g_res.text, "html.parser")
            
            # ページ内の全テーブルをチェックして打者・投手を判別
            for table in g_soup.find_all("table"):
                th_texts = [th.get_text(strip=True) for th in table.find_all("th")]
                if not th_texts: continue
                
                # --- 🏏 打者テーブルの解析 ---
                if "安打" in th_texts and "打点" in th_texts and "投球回" not in th_texts:
                    idx_h = th_texts.index("安打") if "安打" in th_texts else -1
                    idx_hr = th_texts.index("本塁打") if "本塁打" in th_texts else -1
                    
                    for tr in table.find("tbody").find_all("tr"):
                        tds = tr.find_all("td")
                        if not tds: continue
                        
                        a_tag = tr.find("a", href=re.compile(r'/player/\d+'))
                        if not a_tag: continue
                        
                        # YahooのURLからスポナビIDを抽出
                        yahoo_id = re.search(r'/player/(\d+)', a_tag['href']).group(1)
                        # 🚀 画面から選手名を取得
                        player_name = a_tag.get_text(strip=True)
                        
                        # スポナビIDをNPBのplayer_idに変換
                        actual_player_id = yahoo_to_npb_map.get(yahoo_id)
                        if not actual_player_id:
                            continue
                        
                        hits = safe_int(tds[idx_h].get_text()) if idx_h != -1 else 0
                        hr = safe_int(tds[idx_hr].get_text()) if idx_hr != -1 else 0
                        tb = hits + (hr * 3) # 簡易塁打
                        
                        if actual_player_id not in daily_data:
                            daily_data[actual_player_id] = {
                                "player_id": actual_player_id, 
                                "sportsnavi_id": yahoo_id,
                                "player_name": player_name, # 🚀 選手名を追加
                                "date": target_date,
                                "b_hits": hits, "b_hr": hr, "b_tb": tb,
                                "p_k": 0, "p_ip": 0.0, "p_w": 0, "p_hld": 0, "p_sv": 0
                            }
                        else:
                            daily_data[actual_player_id]["b_hits"] += hits
                            daily_data[actual_player_id]["b_hr"] += hr
                            daily_data[actual_player_id]["b_tb"] += tb

                # --- ⚾️ 投手テーブルの解析 ---
                elif "投球回" in th_texts and ("三振" in th_texts or "奪三振" in th_texts):
                    idx_ip = th_texts.index("投球回")
                    idx_k = th_texts.index("奪三振") if "奪三振" in th_texts else th_texts.index("三振")
                    
                    for tr in table.find("tbody").find_all("tr"):
                        tds = tr.find_all("td")
                        if not tds: continue
                        
                        a_tag = tr.find("a", href=re.compile(r'/player/\d+'))
                        if not a_tag: continue
                        
                        # YahooのURLからスポナビIDを抽出
                        yahoo_id = re.search(r'/player/(\d+)', a_tag['href']).group(1)
                        # 🚀 画面から選手名を取得
                        player_name = a_tag.get_text(strip=True)
                        
                        # スポナビIDをNPBのplayer_idに変換
                        actual_player_id = yahoo_to_npb_map.get(yahoo_id)
                        if not actual_player_id:
                            continue
                        
                        ip_val = convert_ip(tds[idx_ip].get_text(strip=True))
                        k_val = safe_int(tds[idx_k].get_text())
                        
                        row_text = tr.get_text()
                        w_val = 1 if "○" in row_text else 0
                        sv_val = 1 if "S" in row_text else 0
                        hld_val = 1 if "H" in row_text else 0
                        
                        if actual_player_id not in daily_data:
                            daily_data[actual_player_id] = {
                                "player_id": actual_player_id, 
                                "sportsnavi_id": yahoo_id,
                                "player_name": player_name, # 🚀 選手名を追加
                                "date": target_date,
                                "b_hits": 0, "b_hr": 0, "b_tb": 0,
                                "p_k": k_val, "p_ip": ip_val, "p_w": w_val, "p_hld": hld_val, "p_sv": sv_val
                            }
                        else:
                            daily_data[actual_player_id]["p_k"] += k_val
                            daily_data[actual_player_id]["p_ip"] += ip_val
                            daily_data[actual_player_id]["p_w"] = max(daily_data[actual_player_id]["p_w"], w_val)
                            daily_data[actual_player_id]["p_hld"] = max(daily_data[actual_player_id]["p_hld"], hld_val)
                            daily_data[actual_player_id]["p_sv"] = max(daily_data[actual_player_id]["p_sv"], sv_val)

        except Exception as e:
            print(f"   ⚠️ 試合データ取得エラー ({game_url}): {e}")

    # 3. Supabaseへ一括Upsert保存
    records = list(daily_data.values())
    total = len(records)
    
    if total == 0:
        print("   ※登録するデータがありませんでした。")
        return
        
    print(f"🚀 {total} 名の選手データをSupabaseへ保存します...")
    
    success = 0
    for i in range(0, total, 100):
        chunk = records[i:i+100]
        try:
            supabase.table("daily_performance").upsert(chunk, on_conflict="player_id,date").execute()
            success += len(chunk)
            print(f"   💾 {success} / {total} 件保存完了...")
        except Exception as e:
            print(f"   ❌ 保存エラー: {e}")
            
    print("🎉 日次データの取得と保存がすべて完了しました！\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fetch_daily_performance(sys.argv[1])
    else:
        fetch_daily_performance()