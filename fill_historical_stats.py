import os
import re
import time
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import unicodedata

try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

# --- 設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# データベースの保存列
BATTER_DB_COLS = ["player_id", "名前", "年度", "所属球団", "is_active_season", "試合", "打席", "打数", "安打", "二塁打", "三塁打", "本塁打", "打点", "盗塁", "四球", "死球", "三振", "打率", "長打率", "出塁率"]
PITCHER_DB_COLS = ["player_id", "名前", "年度", "所属球団", "is_active_season", "登板", "先発", "勝利", "敗戦", "セーブ", "ホールド", "HP", "完投", "完封", "投球回", "安打", "本塁打", "四球", "死球", "三振", "失点", "自責点", "防御率"]

TEAM_NAME_MAP = {
    "巨人": "読　売", "ヤクルト": "東京ヤクルト", "DeNA": "横浜DeNA", "中日": "中　日", "阪神": "阪　神", "広島": "広島東洋",
    "西武": "埼玉西武", "日本ハム": "北海道日本ハム", "ロッテ": "千葉ロッテ", "オリックス": "オリックス", "ソフトバンク": "福岡ソフトバンク", "楽天": "東北楽天"
}

def safe_float(val):
    try:
        if val is None: return 0.0
        s = str(val).replace('+', '').replace('null', '0').replace('*', '').replace(',', '').strip()
        if not s or s == '-': return 0.0
        return float(s)
    except: 
        return 0.0

def format_ip(ip_str):
    try:
        if '.' in ip_str:
            parts = ip_str.split('.')
            return float(parts[0]) + (float(parts[1])/3.0)
        return float(ip_str)
    except: return 0.0

def fetch_and_update_history():
    print("📋 選手データを取得中...")
    
    # 1. 1軍選手を取得（上限を3000件に拡張して1000件制限を突破！）
    res_main = supabase.table("players").select("player_id, sportsnavi_id, player_name, position_detail").limit(3000).execute()
    
    # 2. ファーム専用選手も取得（上限3000件拡張）
    res_farm = supabase.table("farm_players").select("player_id, sportsnavi_id, player_name, position_detail").limit(3000).execute()

    # 3. 1軍と2軍のデータを合体
    players = res_main.data + res_farm.data

    if not players:
        print("選手が見つかりませんでした。")
        return

    print(f"🚀 【本番実行】{len(players)}人の過去成績を巡回して補完します...")

    for i, p in enumerate(players):
        s_id = p.get("sportsnavi_id")
        p_id = str(p["player_id"]).zfill(8)
        p_name = p["player_name"]
        is_pitcher = p.get("position_detail") == "投手"

        if not s_id:
            continue

        print(f"[{i+1}/{len(players)}] {p_name} のデータを取得中...")
        url = f"https://baseball.yahoo.co.jp/npb/player/{s_id}/top"
        
        try:
            res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            res.encoding = "utf-8"
            soup = BeautifulSoup(res.text, "html.parser")
            
            tables = soup.find_all("table")
            target_table = None
            for tbl in tables:
                th_text = tbl.find("th").text if tbl.find("th") else ""
                if "年度" in th_text:
                    target_table = tbl
                    break
            
            if not target_table:
                time.sleep(0.5)
                continue

            header_row = target_table.find("tr")
            cols = [re.sub(r'\s+', '', unicodedata.normalize('NFKC', cell.text)) for cell in header_row.find_all(['th', 'td'])]
            
            if "年度" not in cols or "チーム名" not in cols:
                time.sleep(0.5)
                continue

            stats_list = []
            rows = target_table.find_all("tr")
            for row in rows[1:]:
                cells = row.find_all(['th', 'td'])
                if not cells or len(cells) != len(cols): continue
                
                year_idx = cols.index("年度")
                year_text = cells[year_idx].text.strip()
                if not year_text.isdigit(): continue 
                
                year = int(year_text)
                
                team_idx = cols.index("チーム名")
                raw_team = cells[team_idx].text.strip()
                raw_team = re.sub(r'\s+', '', raw_team)
                team_name = TEAM_NAME_MAP.get(raw_team, raw_team)

                s = {
                    "player_id": p_id,
                    "名前": p_name,
                    "年度": year,
                    "所属球団": team_name,
                    "is_active_season": False 
                }

                for idx, cell in enumerate(cells):
                    c = cols[idx]
                    val = cell.text.strip().replace('-', '0')
                    
                    if c in ["チーム名", "年度"]: continue
                    if c in ["被安打", "安打"]: c = "安打"
                    if c in ["被本塁打", "本塁打"]: c = "本塁打"
                    if c in ["与四球", "四球"]: c = "四球"
                    if c in ["与死球", "死球"]: c = "死球"
                    if c in ["奪三振", "三振"]: c = "三振"
                    
                    if c == "投球回": s[c] = val
                    elif "." in val or c in ["打率", "防御率", "出塁率", "長打率"]: s[c] = safe_float(val)
                    else: s[c] = int(safe_float(val))

                stats_list.append(s)

            if stats_list:
                table_name = "pitching_stats" if is_pitcher else "batting_stats"
                db_cols = PITCHER_DB_COLS if is_pitcher else BATTER_DB_COLS
                
                final_data = [{k: v for k, v in row.items() if k in db_cols} for row in stats_list]
                
                # Supabaseに一括保存
                supabase.table(table_name).upsert(final_data, on_conflict="player_id,年度,所属球団").execute()

        except Exception as e:
            print(f"⚠️ {p_name} の取得中にエラーが発生しました: {e}")
        
        time.sleep(0.5)

    print("🎉 すべての過去データ補完が完了しました！")

if __name__ == "__main__":
    fetch_and_update_history()