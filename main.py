import csv
import time
from supabase import create_client, Client

# ==========================================
# 1. 設定情報 (GitHub Secretsから取得)
# ==========================================
import os
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. ユーティリティ関数
# ==========================================

def dotFormat(value, precision=3):
    if value is None: return ".000"
    try:
        f_val = float(value)
        fmt = "{:." + str(precision) + "f}"
        formatted = fmt.format(f_val)
        if formatted.startswith("0."): return formatted[1:]
        if formatted.startswith("-0."): return "-" + formatted[2:]
        return formatted
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
    """1.1 -> 1.333"""
    s = str(ip_str)
    if "." not in s: return float(s)
    i, f = s.split(".")
    return int(i) + (int(f) / 3.0)

# ==========================================
# 3. 2026年データの集計ロジック
# ==========================================

def aggregate_2026_stats():
    print("--- 2026年度 daily_performance からデータを集計中 ---")
    res = supabase.table("daily_performance").select("*").eq("年度", 2026).execute()
    logs = res.data
    if not logs: return [], []

    batters = {}
    pitchers = {}

    for d in logs:
        pid = d['player_id']
        # --- 野手集計 ---
        if d.get('打席', 0) > 0:
            if pid not in batters:
                batters[pid] = {k: 0 for k in ['試合','打席','打数','得点','安打','二塁打','三塁打','本塁打','塁打','打点','盗塁','盗塁刺','犠打','犠飛','四球','死球','三振','併殺打']}
                batters[pid].update({"player_id": pid, "名前": d['名前'], "年度": 2026, "所属球団": d.get('team_name')})
            
            p = batters[pid]
            for k in p.keys():
                if k in d and isinstance(d[k], (int, float)): p[k] += d[k]

        # --- 投手集計 ---
        if d.get('登板', 0) > 0 or d.get('投球回', "0") != "0":
            if pid not in pitchers:
                pitchers[pid] = {k: 0.0 for k in ['登板','勝利','敗戦','セーブ','ホールド','HP','完投','完封','無四球','打者','安打','本塁打','四球','死球','三振','暴投','ボーク','失点','自責点']}
                pitchers[pid].update({"player_id": pid, "名前": d['名前'], "年度": 2026, "所属球団": d.get('team_name'), "投球回": "0.0"})
            
            p = pitchers[pid]
            for k in p.keys():
                if k in d and k != "投球回" and isinstance(d[k], (int, float)): p[k] += d[k]
            p["投球回"] = add_ip(p["投球回"], d.get("投球回", "0.0"))

    return list(batters.values()), list(pitchers.values())

# ==========================================
# 4. 分析実行
# ==========================================

def run_analysis(batters, pitchers):
    print("--- セイバーメトリクス指標を計算中 (2026年度のみ) ---")
    # 係数は暫定 (本来はリーグ平均から算出するが、まずは固定)
    lg_woba = 0.315
    lg_fip_c = 3.12

    # 野手計算
    for b in batters:
        pa = b['打席']
        if pa > 0:
            h1 = b['安打'] - b['二塁打'] - b['三塁打'] - b['本塁打']
            woba = (0.7*b['四球'] + 0.72*b['死球'] + 0.88*h1 + 1.24*b['二塁打'] + 1.56*b['三塁打'] + 2.05*b['本塁打']) / pa
            b['wOBA'] = dotFormat(woba)
            b['打率'] = round(b['安打'] / b['打数'], 3) if b['打数'] > 0 else 0
            b['出塁率'] = round((b['安打']+b['四球']+b['死球']) / pa, 3)
            b['長打率'] = round(b['塁打'] / b['打数'], 3) if b['打数'] > 0 else 0
            b['OPS'] = dotFormat(b['出塁率'] + b['長打率'])
            b['ISOp'] = dotFormat(b['長打率'] - b['打率'])
            b['wRC+'] = int((woba / lg_woba) * 100)
            b['野手WAR'] = round(((woba - lg_woba) * pa / 1.2) / 10, 2)
            b['ランク'] = "SSS" if b['野手WAR'] > 5.0 else "S" if b['野手WAR'] > 3.0 else "A" if b['野手WAR'] > 1.0 else "B"

    # 投手計算
    for p in pitchers:
        ip_f = ip_to_float(p['投球回'])
        if ip_f > 0:
            fip = ((13*p['本塁打'] + 3*(p['四球']+p['死球']) - 2*p['三振']) / ip_f) + lg_fip_c
            p['FIP'] = round(fip, 2)
            p['防御率'] = round((p['自責点'] * 9) / ip_f, 2)
            p['WHIP'] = round((p['安打'] + p['四球']) / ip_f, 2)
            p['K/BB'] = round(p['三振'] / p['四球'], 2) if p['四球'] > 0 else p['三振']
            p['投手WAR'] = round(((4.0 - fip) * ip_f / 9) / 10, 2)
            p['ランク'] = "SSS" if p['投手WAR'] > 5.0 else "S" if p['投手WAR'] > 3.0 else "A" if p['投手WAR'] > 1.0 else "B"

    return batters, pitchers

def main():
    # 1. 2026年分を日別データから集計
    batters_2026, pitchers_2026 = aggregate_2026_stats()
    
    if not batters_2026 and not pitchers_2026:
        print("更新対象データがありませんでした。")
        return

    # 2. 指標を計算
    batters_final, pitchers_final = run_analysis(batters_2026, pitchers_2026)

    # 3. Supabaseに2026年度行として保存 (upsert)
    print("Supabaseの累計テーブルを更新中...")
    if batters_final:
        supabase.table("batting_stats").upsert(batters_final, on_conflict="player_id,年度").execute()
    if pitchers_final:
        supabase.table("pitching_stats").upsert(pitching_final, on_conflict="player_id,年度").execute()
    
    print("【成功】 2026年度の累計成績を正常に更新しました。")

if __name__ == "__main__":
    main()