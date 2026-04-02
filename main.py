import csv
import time
from supabase import create_client, Client

# ==========================================
# 1. 設定情報
# ==========================================
SUPABASE_URL = "https://wnzsahimcnxnxkkxfgdb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenNhaGltY254bnhra3hmZ2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3NzczMCwiZXhwIjoyMDg5OTUzNzMwfQ.w6-M0GEdteLs36UrYK3ykY1jbk2V-HIzdxKlaem70is"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. ユーティリティ関数
# ==========================================

def dotFormat(value, precision=3):
    if value is None: return ".---"
    try:
        f_val = float(value)
        fmt = "{:." + str(precision) + "f}"
        formatted = fmt.format(f_val)
        if formatted.startswith("0."): return formatted[1:]
        if formatted.startswith("-0."): return "-" + formatted[2:]
        return formatted
    except (ValueError, TypeError):
        return ".---"

def convert_ip_to_decimal(ip_val):
    try:
        val = float(ip_val)
    except (ValueError, TypeError):
        return 0.0
    integer_part = int(val)
    fractional_part = round(val - integer_part, 1)
    if fractional_part == 0.1: return integer_part + (1/3)
    elif fractional_part == 0.2: return integer_part + (2/3)
    return float(val)

def get_rank(value, metric_type="WAR"):
    if value is None: return "B"
    if metric_type == "WAR":
        if value > 6.0: return "SSS"
        if value > 4.5: return "SS"
        if value > 3.0: return "S"
        if value > 1.5: return "A"
        return "B"
    return "B"

# ==========================================
# 【新規追加】 3. 係数自動更新システム
# ==========================================

def update_sabermetric_constants(year=2026):
    """daily_performanceの全データからリーグ平均wOBAを逆算して定数テーブルを更新する"""
    print(f"--- {year}年度のリーグ係数を再計算中 (キャリブレーション) ---")
    
    # 1. その年度の全打席・全安打などの合計を取得
    res = supabase.table("daily_performance").select("打席, 四球, 死球, 安打, 二塁打, 三塁打, 本塁打").eq("年度", year).execute()
    data = res.data
    
    if not data:
        print("   -> daily_performanceにデータがないため、計算をスキップします。")
        return None

    total_pa = sum(float(d.get('打席', 0)) for d in data)
    if total_pa == 0: return None

    # wOBAの分子を計算 (係数は固定値を使用)
    total_woba_numerator = sum(
        (0.69 * float(d.get('四球', 0))) + 
        (0.72 * float(d.get('死球', 0))) + 
        (0.87 * float(d.get('安打', 0) - d.get('二塁打', 0) - d.get('三塁打', 0) - d.get('本塁打', 0))) + 
        (1.21 * float(d.get('二塁打', 0))) + 
        (1.53 * float(d.get('三塁打', 0))) + 
        (1.94 * float(d.get('本塁打', 0)))
        for d in data
    )

    new_lg_woba = total_woba_numerator / total_pa
    print(f"   -> 算出されたリーグ平均wOBA: {new_lg_woba:.4f}")

    # 2. sabermetric_constants テーブルを更新
    constants_data = {
        "year": year,
        "lg_woba": round(new_lg_woba, 4),
        "fip_const": 3.12  # 必要に応じて調整
    }
    supabase.table("sabermetric_constants").upsert(constants_data).execute()
    
    print("【成功】 係数テーブルを最新化しました。")
    return constants_data

# ==========================================
# 4. 分析システムクラス
# ==========================================

class BaseballAnalysisSystem:
    def __init__(self, batters_data, pitchers_data, constants):
        self.batters_raw = batters_data
        self.pitchers_raw = pitchers_data
        # DBから取得した最新係数を使用、なければデフォルト値
        self.lg_woba = float(constants.get('lg_woba', 0.320))
        self.lg_fip_const = float(constants.get('fip_const', 3.12))

    def process_pitching(self):
        results = []
        for p in self.pitchers_raw:
            ip_dec = convert_ip_to_decimal(p.get('投球回', 0))
            if ip_dec <= 0: continue
            hr, bb, hbp, so, tbf, er, h = [float(p.get(k, 0)) for k in ['本塁打', '四球', '死球', '三振', '打者', '自責点', '安打']]
            fip_val = ((13 * hr + 3 * (bb + hbp) - 2 * so) / ip_dec) + self.lg_fip_const
            war_val = ((4.2 - fip_val) * (ip_dec / 9)) / 10
            stats = p.copy()
            stats.update({
                "投手WAR": round(war_val, 2), "FIP": round(fip_val, 2),
                "WHIP": round((h + bb) / ip_dec, 2), "K/BB": round(so / bb, 2) if bb > 0 else so,
                "K-BB%": round(((so - bb) / tbf) * 100, 1) if tbf > 0 else 0.0,
                "K/9": round((so * 9) / ip_dec, 2), "BB/9": round(((bb + hbp) * 9) / ip_dec, 2),
                "ランク": get_rank(war_val, "WAR")
            })
            results.append(stats)
        return results

    def process_batting(self):
        results = []
        for b in self.batters_raw:
            pa = float(b.get('打席', 0))
            if pa <= 0: continue
            ab, h, d2, d3, hr, bb, hbp = [float(b.get(k, 0)) for k in ['打数', '安打', '二塁打', '三塁打', '本塁打', '四球', '死球']]
            # 単打を安打数から逆算
            h1 = h - d2 - d3 - hr
            woba_val = ((0.69 * bb) + (0.72 * hbp) + (0.87 * h1) + (1.21 * d2) + (1.53 * d3) + (1.94 * hr)) / pa
            
            # 簡易的な守備位置補正（必要に応じて調整）
            pos = b.get('position_detail', "")
            pos_adj = {"捕手": 2.5, "遊撃手": 2.0, "二塁手": 1.5, "中堅手": 1.0, "三塁手": 0.5}.get(pos, 0.0)
            
            war_val = (((woba_val - self.lg_woba) * pa / 1.2) + pos_adj) / 10
            
            stats = b.copy()
            obp = (h + bb + hbp) / pa
            slg = (h + d2 + d3*2 + hr*3) / ab if ab > 0 else 0
            stats.update({
                "野手WAR": round(war_val, 2), "wOBA": dotFormat(woba_val),
                "wRC+": round((woba_val / self.lg_woba) * 100) if self.lg_woba > 0 else 100,
                "OPS": dotFormat(obp + slg), "ISOp": dotFormat(slg - (h / ab)) if ab > 0 else ".000",
                "ランク": get_rank(war_val, "WAR")
            })
            results.append(stats)
        return results

# ==========================================
# 5. メイン実行パイプライン
# ==========================================

def batch_upsert(table_name, data, batch_size=100):
    total = len(data)
    for i in range(0, total, batch_size):
        batch = data[i : i + batch_size]
        print(f"  - {table_name}: {i + len(batch)} / {total} 件目を処理中...")
        supabase.table(table_name).upsert(batch, on_conflict="player_id,年度").execute()
        time.sleep(0.5)

def run_update_pipeline():
    print("--- 安定版 ID基準分析システム 起動 ---")

    # 1. 係数のキャリブレーション (daily_performanceを元に更新)
    current_constants = update_sabermetric_constants(2026)
    
    # DBから最新の係数を取得 (更新に失敗した時のための予備)
    if not current_constants:
        res_c = supabase.table("sabermetric_constants").select("*").eq("year", 2026).single().execute()
        current_constants = res_c.data if res_c.data else {}

    # 2. データ取得
    batters_raw = supabase.table("batting_stats").select("*").execute().data
    pitchers_raw = supabase.table("pitching_stats").select("*").execute().data
    
    # 3. 分析実行 (最新係数を渡す)
    analyzer = BaseballAnalysisSystem(batters_raw, pitchers_raw, current_constants)
    calculated_batters = analyzer.process_batting()
    calculated_pitchers = analyzer.process_pitching()

    # 4. 書き込み
    print("Supabaseへ小分け(バッチ処理)で書き込み中...")
    try:
        if calculated_pitchers:
            batch_upsert("pitching_stats", calculated_pitchers)
        if calculated_batters:
            batch_upsert("batting_stats", calculated_batters)
        print("【成功】 全データの更新が完了しました。")
    except Exception as e:
        print(f"【エラー】 DB書き込み失敗: {e}")

    # CSV出力 (バックアップ)
    if calculated_batters:
        keys_b = calculated_batters[0].keys()
        with open("batting_full_analysis.csv", 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=keys_b); writer.writeheader(); writer.writerows(calculated_batters)
    
    if calculated_pitchers:
        keys_p = calculated_pitchers[0].keys()
        with open("pitching_full_analysis.csv", 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=keys_p); writer.writeheader(); writer.writerows(calculated_pitchers)
    
    print("【成功】 バックアップCSVを出力しました。")

if __name__ == "__main__":
    run_update_pipeline()