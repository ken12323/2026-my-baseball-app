import os
import re
import requests
import time
from bs4 import BeautifulSoup
from supabase import create_client, Client

# --- Supabase設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 12球団URL設定
TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376
}

def safe_float(val):
    try:
        val = str(val).replace('-', '0').replace('null', '0').replace('*', '')
        return float(val) if val else 0.0
    except: return 0.0

def safe_int(val):
    return int(safe_float(val))

def dotFormat(value, precision=3):
    f_val = safe_float(value)
    fmt = "{:." + str(precision) + "f}"
    formatted = fmt.format(f_val).replace('0.', '.')
    return formatted if formatted.startswith('.') else formatted

def scrape_team(team_name, team_id, mode="battingstats"):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    print(f"📡 {team_name} ({mode}) 取得中...")
    
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, "html.parser")
    
    # ページ内のすべてのテーブルを取得（規定打席以上・以下の両方を結合する）
    tables = soup.find_all("table")
    extracted_data = []

    for table in tables:
        # ヘッダーを解析して列番号を特定する
        header_cells = table.find("thead").find_all("th")
        cols = [th.text.strip() for th in header_cells]
        
        rows = table.find("tbody").find_all("tr")
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < 5: continue
            
            player_a = tds[1].find("a")
            if not player_a: continue
            player_id = re.search(r'/player/(\d+)/', player_a['href']).group(1)
            
            # 基本枠の作成
            s = {
                "player_id": player_id,
                "名前": player_a.text.strip(),
                "年度": 2026,
                "所属球団": team_name
            }
            
            # 各列のデータを名前ベースで取得
            for i, td in enumerate(tds):
                if i >= len(cols): break
                c_name = cols[i]
                val = td.text.strip().replace('-', '0')
                
                # 数値に変換して格納
                if c_name in ["選手名", "背番号", "位置", "順位"]: continue
                if c_name == "投球回": s[c_name] = val
                elif "." in val or c_name in ["打率", "防御率"]: s[c_name] = safe_float(val)
                else: s[c_name] = safe_int(val)
            
            extracted_data.append(s)
    return extracted_data

def calculate_metrics(batters, pitchers):
    print("📈 指標を再計算中（OBP/SLG/WAR）...")
    LG_WOBA = 0.315 # 2026暫定

    for b in batters:
        pa = b.get("打席", 0)
        ab = b.get("打数", 0)
        h = b.get("安打", 0)
        bb = b.get("四球", 0)
        hbp = b.get("死球", 0)
        tb = b.get("塁打", 0)

        # 1. 出塁率 (OBP)
        b["出塁率"] = round((h + bb + hbp) / pa, 3) if pa > 0 else 0.0
        # 2. 長打率 (SLG)
        b["長打率"] = round(tb / ab, 3) if ab > 0 else 0.0
        # 3. OPS
        b["OPS"] = dotFormat(b["出塁率"] + b["長打率"])
        # 4. ISOp
        b["ISOp"] = dotFormat(b["長打率"] - b["打率"]) if "打率" in b else ".000"
        
        # 5. wOBA & WAR
        if pa > 0:
            h1 = h - b.get("二塁打", 0) - b.get("三塁打", 0) - b.get("本塁打", 0)
            woba = (0.7*bb + 0.72*hbp + 0.88*h1 + 1.24*b.get("二塁打", 0) + 1.56*b.get("三塁打", 0) + 2.05*b.get("本塁打", 0)) / pa
            b["wOBA"] = dotFormat(woba)
            b["野手WAR"] = round(((woba - LG_WOBA) * pa / 1.2) / 10, 2)
            b["ランク"] = "S" if b["野手WAR"] > 3.0 else "A" if b["野手WAR"] > 1.0 else "B"

    for p in pitchers:
        ip_str = str(p.get("投球回", "0.0"))
        ip_f = float(ip_str.split('.')[0]) + (float(ip_str.split('.')[1])/3.0) if '.' in ip_str else float(ip_str)
        if ip_f > 0:
            fip = ((13*p.get("本塁打", 0) + 3*(p.get("四球", 0)+p.get("死球", 0)) - 2*p.get("三振", 0)) / ip_f) + 3.12
            p["投手WAR"] = round(((4.0 - fip) * ip_f / 9) / 10, 2)
            p["ランク"] = "S" if p["投手WAR"] > 3.0 else "A" if p["投手WAR"] > 1.0 else "B"

def main():
    all_batters, all_pitchers = [], []
    for t_name, t_id in TEAMS.items():
        all_batters.extend(scrape_team(t_name, t_id, "battingstats"))
        all_pitchers.extend(scrape_team(t_name, t_id, "pitchingstats"))
        time.sleep(1)

    calculate_metrics(all_batters, all_pitchers)

    print(f"🚀 書き込み開始 (野手:{len(all_batters)}, 投手:{len(all_pitchers)})")
    # 50件ずつ小分けにしてSupabaseに送る
    for i in range(0, len(all_batters), 50):
        supabase.table("batting_stats").upsert(all_batters[i:i+50], on_conflict="player_id,年度").execute()
    for i in range(0, len(all_pitchers), 50):
        supabase.table("pitching_stats").upsert(all_pitchers[i:i+50], on_conflict="player_id,年度").execute()
    
    print("✅ 全選手の通算データが正常に同期されました！")

if __name__ == "__main__":
    main()