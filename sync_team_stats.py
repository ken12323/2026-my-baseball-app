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

# --- Supabaseのテーブルにあるカラム名だけの許可リスト (これ以外は送信しない) ---
BATTER_DB_COLS = [
    "player_id", "名前", "年度", "所属球団", "試合", "打席", "打数", "得点", "安打", 
    "二塁打", "三塁打", "本塁打", "塁打", "打点", "盗塁", "盗塁刺", "犠打", "犠飛", 
    "四球", "死球", "三振", "併殺打", "打率", "長打率", "出塁率", "野手WAR", "wOBA", "OPS", "ISOp", "ランク"
]

PITCHER_DB_COLS = [
    "player_id", "名前", "年度", "所属球団", "登板", "勝利", "敗戦", "セーブ", "ホールド", "HP",
    "完投", "完封", "無四球", "打者", "投球回", "安打", "本塁打", "四球", "死球", "三振",
    "暴投", "ボーク", "失点", "自責点", "防御率", "投手WAR", "ランク"
]

def safe_float(val):
    try:
        val = str(val).replace('-', '0').replace('null', '0').replace('*', '').replace(',', '')
        return float(val) if val else 0.0
    except: return 0.0

def safe_int(val):
    return int(safe_float(val))

def dotFormat(value, precision=3):
    f_val = safe_float(value)
    fmt = "{:." + str(precision) + "f}"
    formatted = fmt.format(f_val)
    return formatted.replace('0.', '.') if formatted.startswith('0.') else formatted

def scrape_team(team_name, team_id, mode="battingstats"):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    print(f"📡 {team_name} ({mode}) 取得中...")
    
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, "html.parser")
    
    player_map = {}
    tables = soup.find_all("table")

    for table in tables:
        thead = table.find("thead")
        if not thead: continue
        # ヘッダーから空白を除去
        cols = [th.text.strip().replace('\u3000', '').replace(' ', '') for th in thead.find_all("th")]
        
        try:
            name_idx = cols.index("選手名")
        except ValueError: continue
        
        rows = table.find("tbody").find_all("tr")
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < name_idx + 1: continue
            player_a = tds[name_idx].find("a")
            if not player_a: continue
            
            pid = re.search(r'/player/(\d+)/', player_a['href']).group(1)
            
            if pid not in player_map:
                player_map[pid] = {"player_id": pid, "名前": player_a.text.strip(), "年度": 2026, "所属球団": team_name}
            
            s = player_map[pid]
            for i, td in enumerate(tds):
                if i >= len(cols): break
                c_name = cols[i]
                val = td.text.strip().replace('-', '0')
                
                # キーの正規化
                if c_name == "与四球": c_name = "四球"
                if c_name == "与死球": c_name = "死球"
                if c_name in ["選手名", "背番号", "位置", "順位"]: continue
                
                if c_name == "投球回": s[c_name] = val
                elif "." in val or c_name in ["打率", "防御率"]: s[c_name] = safe_float(val)
                else: s[c_name] = s.get(c_name, 0) + safe_int(val) # 数値は合算

    results = []
    for p in player_map.values():
        if mode == "battingstats" and p.get("試合", 0) > 0: results.append(p)
        elif mode == "pitchingstats" and p.get("登板", 0) > 0: results.append(p)
    return results

def calculate_metrics(batters, pitchers):
    print("📈 指標を再計算中...")
    LG_WOBA = 0.315

    for b in batters:
        pa = b.get("打席", 0)
        ab = b.get("打数", 0)
        h = b.get("安打", 0)
        bb = b.get("四球", 0)
        hbp = b.get("死球", 0)
        tb = b.get("塁打", 0)

        # 出塁率・長打率・OPSを計算
        b["出塁率"] = round((h + bb + hbp) / pa, 3) if pa > 0 else 0.0
        b["長打率"] = round(tb / ab, 3) if ab > 0 else 0.0
        b["OPS"] = dotFormat(b["出塁率"] + b["長打率"])
        b["ISOp"] = dotFormat(b["長打率"] - b.get("打率", 0))
        
        if pa > 0:
            h1 = h - b.get("二塁打", 0) - b.get("三塁打", 0) - b.get("本塁打", 0)
            woba = (0.7*bb + 0.72*hbp + 0.88*h1 + 1.24*b.get("二塁打", 0) + 1.56*b.get("三塁打", 0) + 2.05*b.get("本塁打", 0)) / pa
            b["wOBA"] = dotFormat(woba)
            b["野手WAR"] = round(((woba - LG_WOBA) * pa / 1.2) / 10, 2)
            b["ランク"] = "S" if b["野手WAR"] > 3.0 else "A" if b["野手WAR"] > 1.0 else "B"

    for p in pitchers:
        ip_str = str(p.get("投球回", "0.0"))
        try:
            if '.' in ip_str:
                parts = ip_str.split('.')
                ip_f = float(parts[0]) + (float(parts[1])/3.0)
            else: ip_f = float(ip_str)
        except: ip_f = 0.0

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

    # --- 【重要】送信前に許可リストにあるカラムだけに厳選する ---
    final_batters = [{k: v for k, v in b.items() if k in BATTER_DB_COLS} for b in all_batters]
    final_pitchers = [{k: v for k, v in p.items() if k in PITCHER_DB_COLS} for p in all_pitchers]

    print(f"🚀 送信開始 (野手:{len(final_batters)}, 投手:{len(final_pitchers)})")
    
    try:
        if final_batters:
            for i in range(0, len(final_batters), 50):
                supabase.table("batting_stats").upsert(final_batters[i:i+50], on_conflict="player_id,年度").execute()
        if final_pitchers:
            for i in range(0, len(final_pitchers), 50):
                supabase.table("pitching_stats").upsert(final_pitchers[i:i+50], on_conflict="player_id,年度").execute()
        print("✅ 全行程が正常に完了しました！")
    except Exception as e:
        print(f"❌ 書き込みエラー: {e}")
        exit(1)

if __name__ == "__main__":
    main()