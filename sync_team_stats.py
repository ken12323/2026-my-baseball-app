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
    pass

# --- 設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1軍：YahooのチームID
TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376
}

# ファーム新球団：YahooのチームID
FARM_ONLY_YAHOO_TEAMS = {
    "オイシックス": 806, 
    "ハヤテ": 23879
}

# 2軍：NPB公式サイトのチームコード
NPB_FARM_TEAMS = {
    "巨人": "g", "ヤクルト": "s", "横浜": "db", "中日": "d", "阪神": "t", "広島": "c",
    "西武": "l", "日ハム": "f", "千葉": "m", "オリックス": "b", "ソフトバンク": "h", "楽天": "e",
    "オイシックス": "a", "ハヤテ": "v"
}

TEAM_NAME_MAP = {
    "巨人": "読　売", "ヤクルト": "東京ヤクルト", "横浜": "横浜DeNA", "中日": "中　日", "阪神": "阪　神", "広島": "広島東洋",
    "西武": "埼玉西武", "日ハム": "北海道日本ハム", "千葉": "千葉ロッテ", "オリックス": "オリックス", "ソフトバンク": "福岡ソフトバンク", "楽天": "東北楽天",
    "オイシックス": "オイシックス", "ハヤテ": "くふうハヤテ"
}

PF_MAP = {
    '東京ヤクルト': 1.18, 'ヤクルト': 1.18, '北海道日本ハム': 1.15, '日ハム': 1.15,
    '横浜DeNA': 1.13, 'DeNA': 1.13, '千葉ロッテ': 1.05, 'ロッテ': 1.05,
    '広島東洋': 1.04, '広島': 1.04, '福岡ソフトバンク': 1.01, 'ソフトバンク': 1.01,
    '埼玉西武': 0.97, '西武': 0.97, '読売': 0.95, '巨人': 0.95, 'オリックス': 0.95,
    '東北楽天': 0.91, '楽天': 0.91, '阪神': 0.86, '中日': 0.84,
    'オイシックス': 1.00, 'ハヤテ': 1.00, 'くふうハヤテ': 1.00
}

BATTER_DB_COLS = ["player_id", "名前", "年度", "所属球団", "背番号", "試合", "打席", "打数", "得点", "安打", "二塁打", "三塁打", "本塁打", "塁打", "打点", "盗塁", "盗塁刺", "犠打", "犠飛", "四球", "死球", "三振", "併殺打", "打率", "長打率", "出塁率", "野手WAR", "wOBA", "wRC+", "OPS", "ISOp", "BABIP", "IsoD", "K%", "BB%", "roman", "cospa", "ランク"]
PITCHER_DB_COLS = ["player_id", "名前", "年度", "所属球団", "背番号", "登板", "先発", "勝利", "敗戦", "セーブ", "ホールド", "HP", "完投", "完封", "無四球", "打者", "勝率", "投球回", "安打", "本塁打", "四球", "死球", "三振", "暴投", "ボーク", "失点", "自責点", "防御率", "投手WAR", "FIP", "WHIP", "K/9", "BB/9", "K/BB", "K-BB%", "BABIP", "LOB%", "unluck", "cospa", "ランク"]

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
    return total_man / 10000.0


# ★ 追加：新球団の選手を「farm_players」テーブルにのみ事前登録する安全機能
def sync_farm_only_roster():
    print("🔄 オイシックス・ハヤテの選手を探索し、専用マスター(farm_players)を更新します...")
    
    # 二重登録防止のため、既存の player_id (YahooID) を取得
    res_main = supabase.table("players").select("player_id").execute()
    res_farm = supabase.table("farm_players").select("player_id").execute()
    existing_ids = {str(p["player_id"]) for p in (res_main.data + res_farm.data)}
        
    new_players = []
    for team_name, team_id in FARM_ONLY_YAHOO_TEAMS.items():
        url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/players"
        res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(res.content, "html.parser")
        
        for a in soup.find_all("a", href=re.compile(r"/npb/player/(\d+)/top")):
            match = re.search(r"/npb/player/(\d+)/top", a["href"])
            if not match: continue
            
            yahoo_id = match.group(1)
            
            # すでに登録済みならスルー
            if yahoo_id in existing_ids:
                continue

            texts = list(a.stripped_strings)
            if not texts: continue
            
            is_coach = any(('監督' in t or 'コーチ' in t) and '選手' not in t for t in texts)
            if is_coach: continue
                
            raw_name = ""
            for t in texts:
                if re.match(r'^[\d\.]+$', t): continue
                raw_name = t 
                break
                
            clean_name = re.sub(r'\s+', '', unicodedata.normalize('NFKC', raw_name))
            
            new_players.append({
                "player_id": yahoo_id,
                "sportsnavi_id": yahoo_id,
                "player_name": clean_name,
                "team_name": TEAM_NAME_MAP.get(team_name, team_name)
            })
            existing_ids.add(yahoo_id)
            
    if new_players:
        for i in range(0, len(new_players), 50):
            supabase.table("farm_players").insert(new_players[i:i+50]).execute()
        print(f"✅ 新規ファーム専用選手 {len(new_players)} 名を登録しました！")
    else:
        print("✅ 新規ファーム選手はいませんでした。")


# 🚀 【改修】マスターデータを「スポナビID」をキーにした辞書にする
MASTER_PLAYER_MAP_BY_YAHOO = {}
# NPB公式の選手一覧から名前で引くためのバックアップ（NPBファームページ用）
MASTER_PLAYER_MAP_BY_NAME = {}

def fetch_master():
    print("📋 マスターデータをスポナビIDでインデックス化します...")
    res_main = supabase.table("players").select("player_id, sportsnavi_id, player_name, salary_estimated").execute()
    res_farm = supabase.table("farm_players").select("player_id, sportsnavi_id, player_name, salary_estimated").execute()
    
    for p in (res_main.data + res_farm.data):
        pid = str(p["player_id"]).zfill(8)
        salary = parse_salary_to_oku(p.get("salary_estimated", ""))
        name = re.sub(r'\s+', '', unicodedata.normalize('NFKC', p["player_name"]))

        # A. スポナビIDをキーにする（1軍データ用）
        if p.get("sportsnavi_id"):
            s_id = str(p["sportsnavi_id"]).strip()
            MASTER_PLAYER_MAP_BY_YAHOO[s_id] = {
                "id": pid,
                "name": p["player_name"],
                "salary_oku": salary
            }
        
        # B. 名前をキーにする（スポナビIDがないNPB公式ファームページ用）
        MASTER_PLAYER_MAP_BY_NAME[name] = {
            "id": pid,
            "name": p["player_name"],
            "salary_oku": salary
        }


def scrape_yahoo_first_team(team_name, team_id, mode):
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

        # 🚀 【改修】名前テキストではなく、href内のスポナビIDをキーにする
        href = p_a.get("href", "")
        match = re.search(r'/player/(\d+)', href)
        if not match: continue
        yahoo_id = match.group(1)

        if yahoo_id not in MASTER_PLAYER_MAP_BY_YAHOO:
            continue
        
        p_info = MASTER_PLAYER_MAP_BY_YAHOO[yahoo_id]
        s = {
            "player_id": p_info["id"], 
            "名前": p_info["name"], # DB保存名は公式名を優先
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


def scrape_npb_farm(team_name, team_code, mode):
    # NPB公式ファームページはIDがないため、引き続き名前マッチング（正規化強化）を使用
    prefix = "idb2" if mode == "batting" else "idp2"
    url = f"https://npb.jp/bis/2026/stats/{prefix}_{team_code}.html"
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    soup = BeautifulSoup(res.content, "html.parser")
    player_list = []
    
    for table in soup.find_all("table"):
        th_elements = table.find_all("th")
        if not th_elements: continue
        
        cols = [re.sub(r'\s+', '', unicodedata.normalize('NFKC', th.text)) for th in th_elements]
        if "選手" not in cols: continue
        
        for row in table.find_all("tr"):
            tds = row.find_all("td")
            if not tds or len(tds) != len(cols): continue
            
            raw_name = tds[cols.index("選手")].text
            name = re.sub(r'[\*\s　]+', '', unicodedata.normalize('NFKC', raw_name))
            
            if name not in MASTER_PLAYER_MAP_BY_NAME: continue
            
            p_info = MASTER_PLAYER_MAP_BY_NAME[name]
            s = {
                "player_id": p_info["id"], 
                "名前": p_info["name"], 
                "年度": 2026, 
                "所属球団": TEAM_NAME_MAP.get(team_name, team_name),
                "_salary_oku": p_info["salary_oku"] 
            }
            
            for i, td in enumerate(tds):
                c = cols[i]
                val = td.text.strip().replace('-', '0')
                
                if c == "選手": continue
                if c == "敗北": c = "敗戦"
                if c == "完封勝": c = "完封"
                
                if c == "投球回": s[c] = val
                elif "." in val or c in ["打率", "長打率", "出塁率", "勝率", "防御率"]: 
                    s[c] = safe_float(val)
                else: 
                    s[c] = max(s.get(c, 0), int(safe_float(val)))
            player_list.append(s)
            
    return player_list


def process_league(teams_dict, is_farm=False):
    batters, pitchers = [], []
    for t_name, t_id_or_code in teams_dict.items():
        if is_farm:
            batters.extend(scrape_npb_farm(t_name, t_id_or_code, "batting"))
            pitchers.extend(scrape_npb_farm(t_name, t_id_or_code, "pitching"))
        else:
            batters.extend(scrape_yahoo_first_team(t_name, t_id_or_code, "battingstats"))
            pitchers.extend(scrape_yahoo_first_team(t_name, t_id_or_code, "pitchingstats"))

    if not batters and not pitchers:
        print("データが取得できませんでした。")
        return

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
            
            if b.get("ISOp", 0) < 0.150:
                b["roman"] = 0.0
            else:
                b["roman"] = round(b["ISOp"] + (k / pa) - b.get("打率", 0), 3)
                
            b["cospa"] = round(b["野手WAR"] / sal_oku, 2) if sal_oku > 0 else 0.0
            b["ランク"] = "S" if b["野手WAR"] > 3.0 else "A" if b["野手WAR"] > 1.0 else "B"

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
            
            if "先発" not in p:
                ip_per_game = ip / games
                if ip_per_game >= 3.0:
                    p["先発"] = games
                else:
                    p["先発"] = 0
                    
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

    table_b = "farm_batting_stats" if is_farm else "batting_stats"
    table_p = "farm_pitching_stats" if is_farm else "pitching_stats"
    
    for table, data, cols in [(table_b, batters, BATTER_DB_COLS), (table_p, pitchers, PITCHER_DB_COLS)]:
        final_data = [{k: v for k, v in row.items() if k in cols} for row in data]
        
        for i in range(0, len(final_data), 50):
            supabase.table(table).upsert(final_data[i:i+50], on_conflict="player_id,年度").execute()
            
    prefix = "ファーム（2軍）" if is_farm else "1軍"
    print(f"✅ {prefix}の全指標計算と保存が完了しました！")


def main():
    # 1. まずは安全に、新球団の選手のみを「farm_players」に事前同期
    sync_farm_only_roster()
    
    # 2. マスターデータを最新状態でメモリに読み込み（IDインデックス作成）
    fetch_master()
    
    # 3. 1軍データの処理
    print("🚀 1軍データの処理を開始します...")
    process_league(TEAMS, is_farm=False)
    
    # 4. ファーム（2軍）データの処理
    print("🚀 ファーム（2軍）データの処理を開始します...")
    process_league(NPB_FARM_TEAMS, is_farm=True)


if __name__ == "__main__":
    main()