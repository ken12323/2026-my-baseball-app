import os
import re
import requests
import time
from bs4 import BeautifulSoup
from supabase import create_client, Client

# --- 設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376
}

def dotFormat(value, precision=3):
    try:
        f_val = float(value)
        fmt = "{:." + str(precision) + "f}"
        formatted = fmt.format(f_val)
        return formatted[1:] if formatted.startswith("0.") else formatted
    except: return ".000"

def scrape_team(team_name, team_id, mode="battingstats"):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    print(f"📡 {team_name} ({mode}) を取得中...")
    
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers)
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, "html.parser")
    
    table = soup.find("table")
    if not table: return []

    # ヘッダー取得
    header_cells = table.find("thead").find_all("th")
    col_names = [th.text.strip() for th in header_cells]
    
    rows = table.find("tbody").find_all("tr")
    results = []

    for row in rows:
        tds = row.find_all("td")
        if len(tds) < 5: continue
        
        # 選手IDと名前
        player_a = tds[1].find("a")
        if not player_a: continue
        player_id = re.search(r'/player/(\d+)/', player_a['href']).group(1)
        
        stats = {
            "player_id": player_id,
            "名前": player_a.text.strip(),
            "年度": 2026,
            "所属球団": team_name
        }
        
        # 数値データのマッピング
        for i, td in enumerate(tds):
            col = col_names[i]
            val = td.text.strip().replace('-', '0')
            
            # 特殊な計算が必要なもの以外は数値化
            if col in ["選手名", "背番号", "位置"]: continue
            
            try:
                if col == "投球回":
                    stats[col] = val
                elif "." in val:
                    stats[col] = float(val)
                else:
                    stats[col] = int(val)
            except:
                stats[col] = 0

        results.append(stats)
    
    time.sleep(1) # サーバー負荷軽減
    return results

def calculate_metrics(batters, pitchers):
    print("📈 セイバーメトリクス指標を計算中...")
    lg_woba = 0.315 # 2026年暫定定数

    for b in batters:
        pa = b.get("打席", 0)
        if pa > 0:
            # wOBA計算 (簡易版)
            h1 = b.get("安打", 0) - b.get("二塁打", 0) - b.get("三塁打", 0) - b.get("本塁打", 0)
            woba = (0.7*b.get("四球", 0) + 0.72*b.get("死球", 0) + 0.88*h1 + 1.24*b.get("二塁打", 0) + 1.56*b.get("三塁打", 0) + 2.05*b.get("本塁打", 0)) / pa
            b["wOBA"] = dotFormat(woba)
            b["野手WAR"] = round(((woba - lg_woba) * pa / 1.2) / 10, 2)
            b["ランク"] = "SSS" if b["野手WAR"] > 5.0 else "S" if b["野手WAR"] > 3.0 else "A" if b["野手WAR"] > 1.0 else "B"

    for p in pitchers:
        ip_str = str(p.get("投球回", "0.0"))
        if "." in ip_str:
            i, f = ip_str.split(".")
            ip_f = int(i) + (int(f) / 3.0)
        else:
            ip_f = float(ip_str)

        if ip_f > 0:
            fip = ((13*p.get("本塁打", 0) + 3*(p.get("四球", 0)+p.get("死球", 0)) - 2*p.get("三振", 0)) / ip_f) + 3.12
            p["投手WAR"] = round(((4.0 - fip) * ip_f / 9) / 10, 2)
            p["ランク"] = "SSS" if p["投手WAR"] > 5.0 else "S" if p["投手WAR"] > 3.0 else "A" if p["投手WAR"] > 1.0 else "B"

def main():
    all_batters = []
    all_pitchers = []

    for team_name, team_id in TEAMS.items():
        all_batters.extend(scrape_team(team_name, team_id, "battingstats"))
        all_pitchers.extend(scrape_team(team_name, team_id, "pitchingstats"))

    calculate_metrics(all_batters, all_pitchers)

    print(f"🚀 Supabaseへ書き込み中... (野手:{len(all_batters)}, 投手:{len(all_pitchers)})")
    if all_batters:
        supabase.table("batting_stats").upsert(all_batters, on_conflict="player_id,年度").execute()
    if all_pitchers:
        supabase.table("pitching_stats").upsert(all_pitchers, on_conflict="player_id,年度").execute()
    
    print("✅ 全行程が完了しました！")

if __name__ == "__main__":
    main()