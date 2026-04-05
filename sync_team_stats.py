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

# --- あなたのDBのカラム名と完全に一致させるリスト ---
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
    return "{:." + str(precision) + "f}".format(f_val).replace('0.', '.')

def scrape_team(team_name, team_id, mode="battingstats"):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, "html.parser")
    
    player_map = {}
    tables = soup.find_all("table")

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
            
            # 初回登録
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
                
                if c_name == "投球回":
                    s[c_name] = val
                elif "." in val or c_name in ["打率", "防御率"]:
                    s[c_name] = safe_float(val)
                else:
                    # 既に値があれば大きい方を採用（重複テーブル対策）
                    current_val = s.get(c_name, 0)
                    new_val = safe_int(val)
                    s[c_name] = max(current_val, new_val)

    results = list(player_map.values())
    print(f"  -> {team_name}: {len(results)}名取得")
    return results

def calculate_metrics(batters, pitchers):
    print("📈 指標計算開始...")
    LG_WOBA = 0.315

    for b in batters:
        pa = b.get("打席", 0)
        ab = b.get("打数", 0)
        h = b.get("安打", 0)
        bb = b.get("四球", 0)
        hbp = b.get("死球", 0)
        tb = b.get("塁打", 0)

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

    # 送信直前にフィルタリング（幽霊データ排除 + カラム制限）
    final_batters = []
    for b in all_batters:
        if b.get("試合", 0) > 0:
            final_batters.append({k: v for k, v in b.items() if k in BATTER_DB_COLS})

    final_pitchers = []
    for p in pitchers: # pitchers変数がなかったので修正
        if p.get("登板", 0) > 0:
            final_pitchers.append({k: v for k, v in p.items() if k in PITCHER_DB_COLS})

    # --- 最終デバッグ確認 ---
    if final_batters:
        test = final_batters[0]
        print(f"👀 サンプルデータ(野手): {test['名前']} / {test['所属球団']} / 打席:{test.get('打席')} / 出塁率:{test.get('出塁率')}")

    print(f"🚀 送信開始 (野手:{len(final_batters)}名, 投手:{len(all_pitchers)}名)")
    
    try:
        if final_batters:
            for i in range(0, len(final_batters), 50):
                res = supabase.table("batting_stats").upsert(final_batters[i:i+50], on_conflict="player_id,年度").execute()
                print(f"  ..野手 {i+len(final_batters[i:i+50])}名完了")
        if all_pitchers:
            for i in range(0, len(all_pitchers), 50):
                # 投手用も同様にフィルタリング
                p_chunk = [{k: v for k, v in p.items() if k in PITCHER_DB_COLS and p.get("登板", 0) > 0} for p in all_pitchers[i:i+50]]
                p_chunk = [p for p in p_chunk if p] # 空を排除
                if p_chunk:
                    supabase.table("pitching_stats").upsert(p_chunk, on_conflict="player_id,年度").execute()
            print("  ..投手完了")
        print("✅ 全行程が正常に完了しました！")
    except Exception as e:
        print(f"❌ 書き込みエラー: {e}")
        exit(1)

if __name__ == "__main__":
    main()