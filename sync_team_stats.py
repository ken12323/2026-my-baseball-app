import os
import re
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import unicodedata
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    # GitHub Actionsなど、dotenvがインストールされていない環境ではここを通る
    pass

# --- 設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376
}

TEAM_NAME_MAP = {
    "巨人": "読　売", "ヤクルト": "東京ヤクルト", "横浜": "横浜DeNA", "中日": "中　日", "阪神": "阪　神", "広島": "広島東洋",
    "西武": "埼玉西武", "日ハム": "北海道日本ハム", "千葉": "千葉ロッテ", "オリックス": "オリックス", "ソフトバンク": "福岡ソフトバンク", "楽天": "東北楽天"
}

# パークファクター (5年平均)
PF_MAP = {
    '東京ヤクルト': 1.18, 'ヤクルト': 1.18, '北海道日本ハム': 1.15, '日ハム': 1.15,
    '横浜DeNA': 1.13, 'DeNA': 1.13, '千葉ロッテ': 1.05, 'ロッテ': 1.05,
    '広島東洋': 1.04, '広島': 1.04, '福岡ソフトバンク': 1.01, 'ソフトバンク': 1.01,
    '埼玉西武': 0.97, '西武': 0.97, '読売': 0.95, '巨人': 0.95, 'オリックス': 0.95,
    '東北楽天': 0.91, '楽天': 0.91, '阪神': 0.86, '中日': 0.84
}

# ★ 新規追加カラム（BABIP, IsoD, K%, BB%, roman, cospa, 先発, LOB%, unluck）を追加
BATTER_DB_COLS = ["player_id", "名前", "年度", "所属球団", "背番号", "試合", "打席", "打数", "得点", "安打", "二塁打", "三塁打", "本塁打", "塁打", "打点", "盗塁", "盗塁刺", "犠打", "犠飛", "四球", "死球", "三振", "併殺打", "打率", "長打率", "出塁率", "野手WAR", "wOBA", "wRC+", "OPS", "ISOp", "BABIP", "IsoD", "K%", "BB%", "roman", "cospa", "ランク"]
PITCHER_DB_COLS = ["player_id", "名前", "年度", "所属球団", "背番号", "登板", "先発", "勝利", "敗戦", "セーブ", "ホールド", "HP", "完投", "完封", "無四球", "打者", "勝率", "投球回", "安打", "本塁打", "四球", "死球", "三振", "暴投", "ボーク", "失点", "自責点", "防御率", "投手WAR", "FIP", "WHIP", "K/9", "BB/9", "K/BB", "K-BB%", "BABIP", "LOB%", "unluck", "cospa", "ランク"]

def safe_float(val):
    try:
        if val is None: return 0.0
        # 文字列化して、記号（+やカンマ）を除去してからfloat変換
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

def parse_salary_to_oku(val_str):
    if not val_str: return 0.0
    val_str = str(val_str)
    total_man = 0.0
    oku_match = re.search(r'([0-9.]+)億', val_str)
    if oku_match:
        total_man += float(oku_match.group(1)) * 10000
    man_match = re.search(r'([0-9.]+)万', val_str)
    if man_match:
        total_man += float(man_match.group(1))
    return total_man / 10000.0  # 1万=0.0001億なので10000で割る

# マスターデータ取得用
MASTER_PLAYER_MAP = {}
def fetch_master():
    res = supabase.table("players").select("player_id, player_name, salary_estimated").execute()
    for p in res.data:
        name = re.sub(r'\s+', '', unicodedata.normalize('NFKC', p["player_name"]))
        MASTER_PLAYER_MAP[name] = {
            "id": str(p["player_id"]).zfill(8),
            "salary_oku": parse_salary_to_oku(p.get("salary_estimated", ""))
        }

def scrape_team(team_name, team_id, mode):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, "html.parser")
    player_list = []
    
    table = soup.find("table")
    if not table: return []
    cols = [re.sub(r'\s+', '', unicodedata.normalize('NFKC', th.text)) for th in table.find("thead").find_all("th")]
    
    for row in table.find("tbody").find_all("tr"):
        tds = row.find_all("td")
        p_a = tds[cols.index("選手名")].find("a") if "選手名" in cols else None
        if not p_a: continue
        name = re.sub(r'\s+', '', unicodedata.normalize('NFKC', p_a.text))
        if name not in MASTER_PLAYER_MAP: continue
        
        p_info = MASTER_PLAYER_MAP[name]
        s = {
            "player_id": p_info["id"], 
            "名前": name, 
            # ※過去年度を取得する場合はここを動的に変える必要がありますが、一旦2026固定としています
            "年度": 2026, 
            "所属球団": TEAM_NAME_MAP.get(team_name, team_name),
            "_salary_oku": p_info["salary_oku"] 
        }
        
        for i, td in enumerate(tds):
            c = cols[i]
            val = td.text.strip().replace('-', '0')
            if c in ["被安打", "安打"]: c = "安打"
            if c in ["被本塁打", "本塁打"]: c = "本塁打"
            if c in ["与四球", "四球"]: c = "四球"
            if c in ["与死球", "死球"]: c = "死球"
            if c in ["奪三振", "三振"]: c = "三振"
            if c in ["HP", "ＨＰ"]: c = "HP"
            
            if c == "投球回": s[c] = val
            elif "." in val or c in ["打率", "防御率"]: s[c] = safe_float(val)
            else: s[c] = max(s.get(c, 0), int(safe_float(val)))
        player_list.append(s)
    return player_list

def main():
    fetch_master()
    batters, pitchers = [], []
    for t_name, t_id in TEAMS.items():
        batters.extend(scrape_team(t_name, t_id, "battingstats"))
        pitchers.extend(scrape_team(t_name, t_id, "pitchingstats"))

    # --- リーグ平均の算出 (wRC+用) ---
    total_pa = sum(b.get("打席", 0) for b in batters)
    total_runs = sum(b.get("得点", 0) for b in batters)
    lgR_PA = total_runs / total_pa if total_pa > 0 else 0
    
    total_bb = sum(b.get("四球", 0) for b in batters)
    total_hbp = sum(b.get("死球", 0) for b in batters)
    total_h = sum(b.get("安打", 0) for b in batters)
    total_2b = sum(b.get("二塁打", 0) for b in batters)
    total_3b = sum(b.get("三塁打", 0) for b in batters)
    total_hr = sum(b.get("本塁打", 0) for b in batters)
    lgwOBA = (0.7*total_bb + 0.72*total_hbp + 0.88*(total_h - total_2b - total_3b - total_hr) + 1.24*total_2b + 1.56*total_3b + 2.05*total_hr) / total_pa if total_pa > 0 else 0

    # --- 野手指標計算 ---
    for b in batters:
        pa = b.get("打席", 0)
        ab = max(b.get("打数", 0), 1)
        h = b.get("安打", 0)
        hr = b.get("本塁打", 0)
        bb = b.get("四球", 0)
        hbp = b.get("死球", 0)
        k = b.get("三振", 0)
        sf = b.get("犠飛", 0)
        tb = b.get("塁打", 0)
        sal_oku = b.get("_salary_oku", 0)

        if pa > 0:
            b["出塁率"], b["長打率"] = round((h+bb+hbp)/pa, 3), round(tb/ab, 3)
            b["OPS"] = round(b["出塁率"] + b["長打率"], 3)
            b["ISOp"] = round(b["長打率"] - b.get("打率", 0), 3)
            
            h1 = h - (b.get("二塁打", 0) + b.get("三塁打", 0) + hr)
            woba = (0.7*bb + 0.72*hbp + 0.88*h1 + 1.24*b.get("二塁打", 0) + 1.56*b.get("三塁打", 0) + 2.05*hr) / pa
            b["wOBA"] = round(woba, 3)
            
            pf = (PF_MAP.get(b["所属球団"], 1.0) + 1.0) / 2.0
            b["wRC+"] = int(round((((woba - lgwOBA)/1.24 + lgR_PA) + (lgR_PA - (pf * lgR_PA))) / lgR_PA * 100)) if lgR_PA > 0 else 0
            b["野手WAR"] = round(((woba - 0.315) * pa / 1.2) / 10, 2)
            
            babip_den = ab - k - hr + sf
            b["BABIP"] = round((h - hr) / babip_den, 3) if babip_den > 0 else 0.0
            b["IsoD"] = round(b["出塁率"] - b.get("打率", 0), 3)
            b["K%"] = round((k / pa) * 100, 1)
            b["BB%"] = round((bb / pa) * 100, 1)
            # ISOpが0.150未満なら強制的に0、それ以上なら計算
            if b.get("ISOp", 0) < 0.150:
                b["roman"] = 0.0
            else:
                b["roman"] = round(b["ISOp"] + (k / pa) - b.get("打率", 0), 3)
            b["cospa"] = round(b["野手WAR"] / sal_oku, 2) if sal_oku > 0 else 0.0
            
            b["ランク"] = "S" if b["野手WAR"] > 3.0 else "A" if b["野手WAR"] > 1.0 else "B"

    # --- 投手指標計算 ---
    for p in pitchers:
        ip = format_ip(p.get("投球回", "0"))
        games = p.get("登板", 0)
        
        if ip > 0 and games > 0:
            h = p.get("安打", 0)
            hr = p.get("本塁打", 0)
            bb = p.get("四球", 0)
            hbp = p.get("死球", 0)
            k = p.get("三振", 0)
            runs = p.get("失点", 0)
            sal_oku = p.get("_salary_oku", 0)
            
            # ★ 解決策A：取得データに「先発」がない場合の推測ロジック
            if "先発" not in p:
                ip_per_game = ip / games
                if ip_per_game >= 3.0:
                    p["先発"] = games  # 1試合平均3イニング以上なら「先発」として登板数を全振り
                else:
                    p["先発"] = 0      # 1試合平均3イニング未満なら「救援」
                    
            # 不足項目の補完
            bfp = int((ip * 3) + h + bb + hbp)
            p["打者"] = p.get("打者", bfp)
            
            p["勝率"] = round(p.get("勝利", 0) / (p.get("勝利", 0) + p.get("敗戦", 0)), 3) if (p.get("勝利", 0) + p.get("敗戦", 0)) > 0 else 0.000
            p["WHIP"] = round((bb + h) / ip, 2)
            p["K/9"], p["BB/9"] = round(k*9/ip, 2), round(bb*9/ip, 2)
            p["K/BB"] = round(k/bb, 2) if bb > 0 else float(k)
            p["K-BB%"] = round(((k - bb) / p["打者"]) * 100, 1) if p["打者"] > 0 else 0.0
            
            fip = ((13*hr + 3*(bb+hbp) - 2*k) / ip) + 3.12
            p["FIP"] = round(fip, 2)
            p["投手WAR"] = round(((4.0 - fip) * ip / 9) / 10, 2)
            
            babip_den = p["打者"] - k - bb - hbp - hr
            p["BABIP"] = round((h - hr) / babip_den, 3) if babip_den > 0 else 0.0
            
            lob_den = h + bb + hbp - (1.4 * hr)
            p["LOB%"] = round(((h + bb + hbp - runs) / lob_den) * 100, 1) if lob_den > 0 else 0.0
            
            p["unluck"] = round(p.get("防御率", 0) - p["FIP"], 2)
            p["cospa"] = round(p["投手WAR"] / sal_oku, 2) if sal_oku > 0 else 0.0
            
            p["ランク"] = "S" if p["投手WAR"] > 3.0 else "A" if p["投手WAR"] > 1.0 else "B"

    # --- DB保存 ---
    for table, data, cols in [("batting_stats", batters, BATTER_DB_COLS), ("pitching_stats", pitchers, PITCHER_DB_COLS)]:
        final_data = [{k: v for k, v in row.items() if k in cols} for row in data]
        
        for i in range(0, len(final_data), 50):
            supabase.table(table).upsert(final_data[i:i+50], on_conflict="player_id,年度").execute()
            
    print("✅ 全指標の計算と推測処理、保存が完了しました！")

if __name__ == "__main__":
    main()