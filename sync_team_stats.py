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

def safe_float(val):
    try:
        if val is None: return 0.0
        val = str(val).replace('-', '0').replace('null', '0').replace('*', '').replace(',', '')
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
    
    tables = soup.find_all("table")
    player_map = {} # 重複を避けてデータを合算・管理する

    for table in tables:
        thead = table.find("thead")
        if not thead: continue
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
            
            # 既存データがあればそれをベースに、なければ新規作成
            if pid not in player_map:
                player_map[pid] = {"player_id": pid, "名前": player_a.text.strip(), "年度": 2026, "所属球団": team_name}
            
            s = player_map[pid]
            for i, td in enumerate(tds):
                if i >= len(cols): break
                c_name = cols[i]
                val = td.text.strip().replace('-', '0')
                
                if c_name == "与四球": c_name = "四球"
                if c_name == "与死球": c_name = "死球"
                if c_name in ["選手名", "背番号", "位置", "順位"]: continue
                
                # 数値を加算（複数テーブルにまたがる場合の対策）
                if c_name == "投球回": s[c_name] = val
                elif "." in val or c_name in ["打率", "防御率", "出塁率", "長打率", "OPS"]: 
                    # 率系は加算せず、最新の値を入れる
                    s[c_name] = safe_float(val)
                else:
                    # 試合数、安打数などは加算
                    s[c_name] = s.get(c_name, 0) + safe_int(val)

    # --- フィルタリング（幽霊データの除去） ---
    final_list = []
    for p in player_map.values():
        if mode == "battingstats":
            # 1試合も出ていない野手は保存しない
            if p.get("試合", 0) > 0: final_list.append(p)
        else:
            # 1登板もしていない投手は保存しない
            if p.get("登板", 0) > 0: final_list.append(p)
            
    return final_list

def calculate_metrics(batters, pitchers):
    print("📈 指標を計算中...")
    LG_WOBA = 0.315

    for b in batters:
        pa = max(b.get("打席", 0), 0)
        ab = max(b.get("打数", 0), 0)
        h = b.get("安打", 0)
        bb = b.get("四球", 0)
        hbp = b.get("死球", 0)
        tb = b.get("塁打", 0)

        # 出塁率・長打率・OPSを計算してセット
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

    # 送信前にカラム制限をせず、全ての計算済みデータを送る
    print(f"🚀 書き込み開始 (野手:{len(all_batters)}, 投手:{len(all_pitchers)})")
    
    try:
        # すでにある2026年データを一旦「ゴミ掃除」してから入れるとより確実です
        # supabase.table("batting_stats").delete().eq("年度", 2026).execute()

        if all_batters:
            for i in range(0, len(all_batters), 50):
                supabase.table("batting_stats").upsert(all_batters[i:i+50], on_conflict="player_id,年度").execute()
        if all_pitchers:
            for i in range(0, len(all_pitchers), 50):
                supabase.table("pitching_stats").upsert(all_pitchers[i:i+50], on_conflict="player_id,年度").execute()
        print("✅ 全行程が完了しました！")
    except Exception as e:
        print(f"❌ エラー: {e}")
        exit(1)

if __name__ == "__main__":
    main()