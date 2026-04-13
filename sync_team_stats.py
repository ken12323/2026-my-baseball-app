import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import unicodedata
from dotenv import load_dotenv # ★追加: dotenvライブラリを読み込む

# ★追加: .env.local ファイルから環境変数を読み込む
load_dotenv('.env.local')

# --- 設定 ---
# .env.local の変数名が NEXT_PUBLIC_... の場合でも対応できるように OR で繋ぐ
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ エラー: SupabaseのURLまたはキーが設定されていません。")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TEAMS = {
    "巨人": 1, "ヤクルト": 2, "横浜": 3, "中日": 4, "阪神": 5, "広島": 6,
    "西武": 7, "日ハム": 8, "千葉": 9, "オリックス": 11, "ソフトバンク": 12, "楽天": 376
}

# --- NPB公式表記（2025以前のマスターデータと完全一致させる） ---
TEAM_NAME_MAP = {
    "巨人": "読　売", "ヤクルト": "東京ヤクルト", "横浜": "横浜DeNA",
    "中日": "中　日", "阪神": "阪　神", "広島": "広島東洋",
    "西武": "埼玉西武", "日ハム": "北海道日本ハム", "千葉": "千葉ロッテ",
    "オリックス": "オリックス", "ソフトバンク": "福岡ソフトバンク", "楽天": "東北楽天"
}

BATTER_DB_COLS = [
    "player_id", "名前", "年度", "所属球団", "背番号", "試合", "打席", "打数", "得点", "安打", 
    "二塁打", "三塁打", "本塁打", "塁打", "打点", "盗塁", "盗塁刺", "犠打", "犠飛", 
    "四球", "死球", "三振", "併殺打", "打率", "長打率", "出塁率", "野手WAR", "wOBA", "OPS", "ISOp", "ランク"
]

PITCHER_DB_COLS = [
    "player_id", "名前", "年度", "所属球団", "背番号", "登板", "勝利", "敗戦", "セーブ", "ホールド", "HP",
    "完投", "完封", "無四球", "打者", "投球回", "安打", "本塁打", "四球", "死球", "三振",
    "暴投", "ボーク", "失点", "自責点", "防御率", "投手WAR", "FIP", "ランク"
]

def safe_float(val):
    try:
        val = str(val).replace('-', '0').replace('null', '0').replace('*', '').replace(',', '')
        return float(val) if val else 0.0
    except: return 0.0

def safe_int(val):
    return int(safe_float(val))

def dotFormat(f_val, precision=3):
    try:
        formatted = format(safe_float(f_val), f".{precision}f")
        return formatted.replace('0.', '.') if formatted.startswith('0.') else formatted
    except: return ".000"

def scrape_team(team_name, team_id, mode="battingstats"):
    url = f"https://baseball.yahoo.co.jp/npb/teams/{team_id}/{mode}"
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, "html.parser")
    
    player_map = {}
    tables = soup.find_all("table")
    official_team_name = TEAM_NAME_MAP.get(team_name, team_name)

    for table in tables:
        thead = table.find("thead")
        if not thead: continue
        
        # ヘッダーの空白除去と正規化
        cols = []
        for th in thead.find_all("th"):
            clean_text = unicodedata.normalize('NFKC', th.text)
            clean_text = re.sub(r'\s+', '', clean_text)
            cols.append(clean_text)
        
        try:
            name_idx = cols.index("選手名")
        except ValueError: continue
        
        rows = table.find("tbody").find_all("tr")
        for row in rows:
            tds = row.find_all("td")
            if len(tds) < name_idx + 1: continue
            player_a = tds[name_idx].find("a")
            if not player_a: continue
            
            # ★鉄則: URLから抽出したIDを必ず8桁に0埋めする
            raw_pid = re.search(r'/player/(\d+)/', player_a['href']).group(1)
            safe_pid = str(raw_pid).zfill(8)
            
            if safe_pid not in player_map:
                clean_name = re.sub(r'\s+', '', unicodedata.normalize('NFKC', player_a.text.strip()))
                player_map[safe_pid] = {"player_id": safe_pid, "名前": clean_name, "年度": "2026", "所属球団": official_team_name}
            
            s = player_map[safe_pid]
            for i, td in enumerate(tds):
                if i >= len(cols): break
                c_name = cols[i]
                val = td.text.strip().replace('-', '0')
                
                # ★最大の修正ポイント: 投手特有の項目名を打者と同じ名前に強制変換
                if c_name in ["被安打", "安打"]: c_name = "安打"
                if c_name in ["被本塁打", "本塁打"]: c_name = "本塁打"
                if c_name in ["与四球", "四球"]: c_name = "四球"
                if c_name in ["与死球", "死球"]: c_name = "死球"
                if c_name in ["奪三振", "三振"]: c_name = "三振"
                if c_name in ["HP", "ＨＰ"]: c_name = "HP"
                
                if c_name in ["選手名", "位置", "順位", "奪三振率"]: continue
                
                if c_name == "投球回":
                    s[c_name] = val
                elif "." in val or c_name in ["打率", "防御率"]:
                    s[c_name] = safe_float(val)
                else:
                    s[c_name] = max(s.get(c_name, 0), safe_int(val))

    return list(player_map.values())

def calculate_metrics(batters, pitchers):
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
        b["ISOp"] = dotFormat(b["長打率"] - b.get("打率", 0.0))
        
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
            # FIPとWARの計算（被本塁打、与四球などが正しく入ったので計算可能になる）
            fip = ((13*p.get("本塁打", 0) + 3*(p.get("四球", 0)+p.get("死球", 0)) - 2*p.get("三振", 0)) / ip_f) + 3.12
            p["FIP"] = round(fip, 2)
            p["投手WAR"] = round(((4.0 - fip) * ip_f / 9) / 10, 2)
            p["ランク"] = "S" if p["投手WAR"] > 3.0 else "A" if p["投手WAR"] > 1.0 else "B"

def main():
    all_batters, all_pitchers = [], []
    for t_name, t_id in TEAMS.items():
        all_batters.extend(scrape_team(t_name, t_id, "battingstats"))
        all_pitchers.extend(scrape_team(t_name, t_id, "pitchingstats"))

    calculate_metrics(all_batters, all_pitchers)

    final_batters = [{k: v for k, v in b.items() if k in BATTER_DB_COLS} for b in all_batters]
    final_pitchers = [{k: v for k, v in p.items() if k in PITCHER_DB_COLS} for p in all_pitchers]

    print(f"🚀 送信準備 (野手:{len(final_batters)}名, 投手:{len(final_pitchers)}名)")
    
    try:
        if final_batters:
            for i in range(0, len(final_batters), 50):
                supabase.table("batting_stats").upsert(final_batters[i:i+50], on_conflict="player_id,年度").execute()
        if final_pitchers:
            for i in range(0, len(final_pitchers), 50):
                supabase.table("pitching_stats").upsert(final_pitchers[i:i+50], on_conflict="player_id,年度").execute()
        print("✅ 全修正が完了しました。")
    except Exception as e:
        print(f"❌ エラー: {e}")
        exit(1)

if __name__ == "__main__":
    main()