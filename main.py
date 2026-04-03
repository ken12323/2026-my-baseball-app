import os
import time
from supabase import create_client, Client

# ==========================================
# 1. 設定情報 (GitHub Secretsから自動取得)
# ==========================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. 計算用関数
# ==========================================

def dotFormat(value, precision=3):
    try:
        f_val = float(value)
        fmt = "{:." + str(precision) + "f}"
        formatted = fmt.format(f_val)
        return formatted[1:] if formatted.startswith("0.") else formatted
    except: return ".000"

def add_ip(ip1, ip2):
    """野球特有の投球回加算 (0.1 + 0.2 = 1.0)"""
    def to_outs(val):
        s = str(val)
        if "." not in s: return int(float(s)) * 3
        i, f = s.split(".")
        return int(i) * 3 + int(f)
    total_outs = to_outs(ip1) + to_outs(ip2)
    return f"{total_outs // 3}.{total_outs % 3}"

def ip_to_float(ip_str):
    s = str(ip_str)
    if "." not in s: return float(s)
    i, f = s.split(".")
    return int(i) + (int(f) / 3.0)

# ==========================================
# 3. 2026年データの集計 & 分析
# ==========================================

def run_2026_pipeline():
    print("--- 2026年度 daily_performance からデータを抽出中 ---")
    res = supabase.table("daily_performance").select("*").eq("年度", 2026).execute()
    logs = res.data
    
    if not logs:
        print("⚠️ 2026年度のログが見つかりません。スクレイピングが先に行われているか確認してください。")
        return

    print(f"📊 {len(logs)} 件のログを解析して累計を作成します...")

    batters = {}
    pitchers = {}

    # 集計用の器 (カラム名はSQLの結果に準拠)
    b_cols = ['試合','打席','打数','得点','安打','二塁打','三塁打','本塁打','塁打','打点','盗塁','盗塁刺','犠打','犠飛','四球','死球','三振','併殺打']
    p_cols = ['登板','勝利','敗戦','セーブ','ホールド','HP','完投','完封','無四球','打者','安打','本塁打','四球','死球','三振','暴投','ボーク','失点','自責点']

    for d in logs:
        pid = str(d['player_id'])
        
        # 野手集計
        if d.get('打席', 0) > 0:
            if pid not in batters:
                batters[pid] = {col: 0 for col in b_cols}
                batters[pid].update({"player_id": pid, "名前": d['名前'], "年度": 2026, "所属球団": d.get('所属球団') or d.get('team_name')})
            for col in b_cols:
                batters[pid][col] += int(d.get(col, 0) or 0)

        # 投手集計
        if d.get('登板', 0) > 0 or d.get('投球回', "0") != "0":
            if pid not in pitchers:
                pitchers[pid] = {col: 0.0 for col in p_cols}
                pitchers[pid].update({"player_id": pid, "名前": d['名前'], "年度": 2026, "所属球団": d.get('所属球団') or d.get('team_name'), "投球回": "0.0"})
            for col in p_cols:
                pitchers[pid][col] += float(d.get(col, 0) or 0)
            pitchers[pid]["投球回"] = add_ip(pitchers[pid]["投球回"], d.get("投球回", "0.0"))

    # 指標計算 (2026年度基準)
    lg_woba = 0.315
    for b in batters.values():
        pa = b['打席']
        if pa > 0:
            h1 = b['安打'] - b['二塁打'] - b['三塁打'] - b['本塁打']
            woba = (0.7*b['四球'] + 0.72*b['死球'] + 0.88*h1 + 1.24*b['二塁打'] + 1.56*b['三塁打'] + 2.05*b['本塁打']) / pa
            b.update({
                "wOBA": dotFormat(woba), "打率": round(b['安打']/b['打数'], 3) if b['打数']>0 else 0,
                "OPS": dotFormat(((b['安打']+b['四球']+b['死球'])/pa) + (b['塁打']/b['打数'] if b['打数']>0 else 0)),
                "野手WAR": round(((woba - lg_woba) * pa / 1.2) / 10, 2), "ランク": "B"
            })
            if b['野手WAR'] > 1.0: b['ランク'] = "A"
            if b['野手WAR'] > 3.0: b['ランク'] = "S"

    for p in pitchers.values():
        ip_f = ip_to_float(p['投球回'])
        if ip_f > 0:
            fip = ((13*p['本塁打'] + 3*(p['四球']+p['死球']) - 2*p['三振']) / ip_f) + 3.12
            p.update({
                "防御率": round((p['自責点']*9)/ip_f, 2), "投手WAR": round(((4.0 - fip) * ip_f / 9) / 10, 2), "ランク": "B"
            })
            if p['投手WAR'] > 1.0: p['ランク'] = "A"
            if p['投手WAR'] > 3.0: p['ランク'] = "S"

    # 書き込み
    if batters.values():
        supabase.table("batting_stats").upsert(list(batters.values()), on_conflict="player_id,年度").execute()
    if pitchers.values():
        supabase.table("pitching_stats").upsert(list(pitchers.values()), on_conflict="player_id,年度").execute()
    
    print(f"✅ 【完了】 2026年度累計成績を更新しました (野手:{len(batters)}名 / 投手:{len(pitchers)}名)")

if __name__ == "__main__":
    run_2026_pipeline()