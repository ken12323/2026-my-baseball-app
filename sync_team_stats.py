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

# 12球団の定義
TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376
}

def safe_float(val):
    try:
        val = str(val).replace('-', '0').replace('null', '0')
        return float(val) if val else 0.0
    except: return 0.0

def safe_int(val):
    return int(safe_float(val))

def dotFormat(value, precision=3):
    f_val = safe_float(value)
    fmt = "{:." + str(precision) + "f}"
    formatted = fmt.format(f_val)
    return formatted[1:] if formatted.startswith("0.") else formatted

def scrape_team(team_name, team_id, mode="battingstats"):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    print(f"📡 {team_name} ({mode}) を取得中: {url}")
    
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.encoding = "utf-8"
        soup = BeautifulSoup(res.text, "html.parser")
    except Exception as e:
        print(f"❌ リクエストエラー: {e}")
        return []
    
    # ページ内のすべてのテーブルを取得（規定打席以上・以下の両方をカバー）
    tables = soup.find_all("table")
    results = []

    for table in tables:
        header_cells = table.find("thead").find_all("th")
        col_names = [th.text.strip() for th in header_cells]
        
        rows = table.find("tbody").find_all("tr")
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < 5: continue
            
            player_a = tds[1].find("a")
            if not player_a: continue
            
            player_id = re.search(r'/player/(\d+)/', player_a['href']).group(1)
            
            # 基本情報
            stats = {
                "player_id": player_id,
                "名前": player_a.text.strip(),
                "年度": 2026,
                "所属球団": team_name # ここを確実にセット
            }
            
            # 数値データのマッピング
            for i, td in enumerate(tds):
                if i >= len(col_names): break
                col = col_names[i]
                val = td.text.strip().replace('-', '0').replace('*', '')
                
                if col in ["選手名", "背番号", "位置", "順位"]: continue
                
                if col == "投球回":
                    stats[col] = val
                elif "." in val or col in ["打率", "防御率"]:
                    stats[col] = safe_float(val)
                else:
                    stats[col] = safe_int(val)

            results.append(stats)
    
    return results

def calculate_metrics(batters, pitchers):
    print("📈 セイバーメトリクス指標を計算中...")
    lg_woba = 0.315 # 2026年度暫定

    for b in batters:
        pa = b.get("打席", 0)
        ab = b.get("打数", 0)
        h = b.get("安打", 0)
        bb = b.get("四球", 0)
        hbp = b.get("死球", 0)
        tb = b.get("塁打", 0)
        
        # 出塁率 (OBP)
        obp = (h + bb + hbp) / pa if pa > 0 else 0.0
        # 長打率 (SLG)
        slg = tb / ab if ab > 0 else 0.0
        
        b["出塁率"] = round(obp, 3)
        b["長打率"] = round(slg, 3)
        b["OPS"] = dotFormat(obp + slg)
        
        # wOBA & WAR
        if pa > 0:
            h1 = h - b.get("二塁打", 0) - b.get("三塁打", 0) - b.get("本塁打", 0)
            woba = (0.7*bb + 0.72*hbp + 0.88*h1 + 1.24*b.get("二塁打", 0) + 1.56*b.get("三塁打", 0) + 2.05*b.get("本塁打", 0)) / pa
            b["wOBA"] = dotFormat(woba)
            b["野手WAR"] = round(((woba - lg_woba) * pa / 1.2) / 10, 2)
            b["ランク"] = "S" if b["野手WAR"] > 3.0 else "A" if b["野手WAR"] > 1.0 else "B"

    for p in pitchers:
        ip_str = str(p.get("投球回", "0.0"))
        if "." in ip_str:
            i, f = ip_str.split(".")
            ip_f = int(i) + (int(f) / 3.0)
        else: ip_f = float(ip_str)

        if ip_f > 0:
            fip = ((13*p.get("本塁打", 0) + 3*(p.get("四球", 0)+p.get("死球", 0)) - 2*p.get("三振", 0)) / ip_f) + 3.12
            p["投手WAR"] = round(((4.0 - fip) * ip_f / 9) / 10, 2)
            p["ランク"] = "S" if p["投手WAR"] > 3.0 else "A" if p["投手WAR"] > 1.0 else "B"

def main():
    all_batters = []
    all_pitchers = []

    for team_name, team_id in TEAMS.items():
        all_batters.extend(scrape_team(team_name, team_id, "battingstats"))
        all_pitchers.extend(scrape_team(team_name, team_id, "pitchingstats"))
        time.sleep(1)

    calculate_metrics(all_batters, all_pitchers)

    # 重複削除（player_idが重複している場合に備えて）
    print(f"🚀 Supabaseへ書き込み中... (野手:{len(all_batters)}名, 投手:{len(all_pitchers)}名)")
    
    if all_batters:
        # 100件ずつ小分けにして実行（エラー回避）
        for i in range(0, len(all_batters), 100):
            supabase.table("batting_stats").upsert(all_batters[i:i+100], on_conflict="player_id,年度").execute()
            
    if all_pitchers:
        for i in range(0, len(all_pitchers), 100):
            supabase.table("pitching_stats").upsert(all_pitchers[i:i+100], on_conflict="player_id,年度").execute()
    
    print("✅ 全行程が完了しました！")

if __name__ == "__main__":
    main()