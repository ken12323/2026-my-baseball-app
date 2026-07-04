# バックエンドデータベース構造リファレンス (Supabase)

## 1. batting_stats
1軍の打撃成績を管理するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | YES | null |
| 名前 | text | YES | null |
| 年度 | bigint | YES | null |
| 所属球団 | text | YES | null |
| 試合 | bigint | YES | null |
| 打席 | bigint | YES | null |
| 打数 | bigint | YES | null |
| 得点 | bigint | YES | null |
| 安打 | bigint | YES | null |
| 二塁打 | bigint | YES | null |
| 三塁打 | bigint | YES | null |
| 本塁打 | bigint | YES | null |
| 塁打 | bigint | YES | null |
| 打点 | bigint | YES | null |
| 盗塁 | bigint | YES | null |
| 盗塁刺 | bigint | YES | null |
| 犠打 | bigint | YES | null |
| 犠飛 | bigint | YES | null |
| 四球 | bigint | YES | null |
| 死球 | bigint | YES | null |
| 三振 | bigint | YES | null |
| 併殺打 | bigint | YES | null |
| 打率 | double precision | YES | null |
| 長打率 | double precision | YES | null |
| 出塁率 | double precision | YES | null |
| 野手WAR | numeric | YES | null |
| wOBA | text | YES | null |
| wRC+ | integer | YES | null |
| OPS | text | YES | null |
| ISOp | text | YES | null |
| ランク | text | YES | null |
| 背番号 | integer | YES | null |
| BABIP | numeric | YES | null |
| IsoD | numeric | YES | null |
| K% | numeric | YES | null |
| BB% | numeric | YES | null |
| roman | numeric | YES | null |
| cospa | numeric | YES | null |
| is_active_season | boolean | YES | false |
| 故意四 | bigint | YES | null |
| wRAA | numeric | YES | null |

## 2. daily_performance
日ごとの試合パフォーマンス（スタッツ）を記録するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| id | bigint | NO | null |
| player_id | text | NO | null |
| date | date | NO | null |
| b_tb | integer | YES | 0 |
| b_hits | integer | YES | 0 |
| b_hr | integer | YES | 0 |
| p_k | integer | YES | 0 |
| p_ip | numeric | YES | 0.0 |
| p_w | integer | YES | 0 |
| p_hld | integer | YES | 0 |
| p_sv | integer | YES | 0 |
| sportsnavi_id | text | YES | null |
| player_name | text | YES | null |

## 3. draft_route_stats
ドラフト経由別の各種統計データを保持するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| route | text | YES | null |
| players | bigint | YES | null |
| hr | numeric | YES | null |
| hits | numeric | YES | null |
| avghr | numeric | YES | null |

## 4. farm_batting_stats
2軍（ファーム）の打撃成績を管理するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | YES | null |
| 名前 | text | YES | null |
| 年度 | bigint | YES | null |
| 所属球団 | text | YES | null |
| 試合 | bigint | YES | null |
| 打席 | bigint | YES | null |
| 打数 | bigint | YES | null |
| 得点 | bigint | YES | null |
| 安打 | bigint | YES | null |
| 二塁打 | bigint | YES | null |
| 三塁打 | bigint | YES | null |
| 本塁打 | bigint | YES | null |
| 塁打 | bigint | YES | null |
| 打点 | bigint | YES | null |
| 盗塁 | bigint | YES | null |
| 盗塁刺 | bigint | YES | null |
| 犠打 | bigint | YES | null |
| 犠飛 | bigint | YES | null |
| 四球 | bigint | YES | null |
| 死球 | bigint | YES | null |
| 三振 | bigint | YES | null |
| 併殺打 | bigint | YES | null |
| 打率 | double precision | YES | null |
| 長打率 | double precision | YES | null |
| 出塁率 | double precision | YES | null |
| 野手WAR | numeric | YES | null |
| wOBA | text | YES | null |
| wRC+ | integer | YES | null |
| OPS | text | YES | null |
| ISOp | text | YES | null |
| ランク | text | YES | null |
| 背番号 | integer | YES | null |
| BABIP | numeric | YES | null |
| IsoD | numeric | YES | null |
| K% | numeric | YES | null |
| BB% | numeric | YES | null |
| roman | numeric | YES | null |
| cospa | numeric | YES | null |
| is_active_season | boolean | YES | false |
| 故意四 | bigint | YES | null |
| player_name_raw | text | YES | null |

## 5. farm_daily_performance
2軍（ファーム）の日ごとの試合パフォーマンスデータを記録するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | NO | null |
| sportsnavi_id | text | YES | null |
| player_name | text | YES | null |
| date | date | NO | null |
| b_hits | integer | YES | null |
| b_hr | integer | YES | null |
| b_tb | integer | YES | null |
| p_k | integer | YES | null |
| p_ip | numeric | YES | null |
| p_w | integer | YES | null |
| p_hld | integer | YES | null |
| p_sv | integer | YES | null |

## 6. farm_pitching_stats
2軍（ファーム）の投手成績を管理するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | YES | null |
| 名前 | text | YES | null |
| 年度 | bigint | YES | null |
| 所属球団 | text | YES | null |
| 登板 | double precision | YES | null |
| 勝利 | double precision | YES | null |
| 敗戦 | double precision | YES | null |
| セーブ | double precision | YES | null |
| ホールド | double precision | YES | null |
| HP | double precision | YES | null |
| 完投 | double precision | YES | null |
| 完封 | double precision | YES | null |
| 無四球 | double precision | YES | null |
| 勝率 | double precision | YES | null |
| 打者 | double precision | YES | null |
| 投球回 | text | YES | null |
| 安打 | double precision | YES | null |
| 本塁打 | double precision | YES | null |
| 四球 | double precision | YES | null |
| 死球 | double precision | YES | null |
| 三振 | double precision | YES | null |
| 暴投 | double precision | YES | null |
| ボーク | double precision | YES | null |
| 失点 | double precision | YES | null |
| 自責点 | double precision | YES | null |
| 防御率 | double precision | YES | null |
| 投手WAR | numeric | YES | null |
| FIP | numeric | YES | null |
| WHIP | numeric | YES | null |
| K/BB | numeric | YES | null |
| K-BB% | numeric | YES | null |
| K/9 | numeric | YES | null |
| BB/9 | numeric | YES | null |
| ランク | text | YES | null |
| 背番号 | integer | YES | null |
| 先発 | bigint | YES | null |
| BABIP | numeric | YES | null |
| LOB% | numeric | YES | null |
| unluck | numeric | YES | null |
| cospa | numeric | YES | null |
| 故意四 | double precision | YES | null |
| is_active_season | boolean | YES | false |
| player_name_raw | text | YES | null |

## 7. farm_players
2軍（ファーム）に所属する、または所属していたプレイヤーのマスター情報を保持するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | NO | null |
| player_name | text | YES | null |
| team_name | text | YES | null |
| position_detail | text | YES | null |
| throws_bats | text | YES | null |
| height | bigint | YES | null |
| weight | bigint | YES | null |
| birthday | text | YES | null |
| hometown | text | YES | null |
| high_school | text | YES | null |
| university | text | YES | null |
| prev_team_1 | text | YES | null |
| prev_team_2 | text | YES | null |
| prev_team_3 | text | YES | null |
| draft_year | bigint | YES | null |
| draft_rank | bigint | YES | null |
| is_developmental | boolean | YES | false |
| blood_type | text | YES | null |
| years_pro | integer | YES | null |
| salary_estimated | text | YES | null |
| raw_scouting_report | text | YES | null |
| sportsnavi_id | text | YES | null |

## 8. pitching_stats
1軍の投手成績を管理するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | YES | null |
| 名前 | text | YES | null |
| 年度 | bigint | YES | null |
| 所属球団 | text | YES | null |
| 登板 | double precision | YES | null |
| 勝利 | double precision | YES | null |
| 敗戦 | double precision | YES | null |
| セーブ | double precision | YES | null |
| ホールド | double precision | YES | null |
| HP | double precision | YES | null |
| 完投 | double precision | YES | null |
| 完封 | double precision | YES | null |
| 無四球 | double precision | YES | null |
| 勝率 | double precision | YES | null |
| 打者 | double precision | YES | null |
| 投球回 | text | YES | null |
| 安打 | double precision | YES | null |
| 本塁打 | double precision | YES | null |
| 四球 | double precision | YES | null |
| 死球 | double precision | YES | null |
| 三振 | double precision | YES | null |
| 暴投 | double precision | YES | null |
| ボーク | double precision | YES | null |
| 失点 | double precision | YES | null |
| 自責点 | double precision | YES | null |
| 防御率 | double precision | YES | null |
| 投手WAR | numeric | YES | null |
| FIP | numeric | YES | null |
| WHIP | numeric | YES | null |
| K/BB | numeric | YES | null |
| K-BB% | numeric | YES | null |
| K/9 | numeric | YES | null |
| BB/9 | numeric | YES | null |
| ランク | text | YES | null |
| 背番号 | integer | YES | null |
| 先発 | bigint | YES | null |
| BABIP | numeric | YES | null |
| LOB% | numeric | YES | null |
| unluck | numeric | YES | null |
| cospa | numeric | YES | null |
| 故意四 | bigint | YES | null |
| RSAA | numeric | YES | null |

## 9. players
1軍プレイヤーのマスター情報（プロフィール、経歴、ドラフト情報など）を管理するテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | NO | null |
| player_name | text | YES | null |
| team_name | text | YES | null |
| position_detail | text | YES | null |
| throws_bats | text | YES | null |
| height | bigint | YES | null |
| weight | bigint | YES | null |
| birthday | text | YES | null |
| hometown | text | YES | null |
| high_school | text | YES | null |
| university | text | YES | null |
| prev_team_1 | text | YES | null |
| prev_team_2 | text | YES | null |
| prev_team_3 | text | YES | null |
| draft_year | bigint | YES | null |
| draft_rank | text | YES | null |
| is_developmental | boolean | YES | false |
| blood_type | text | YES | null |
| years_pro | integer | YES | null |
| salary_estimated | text | YES | null |
| raw_scouting_report | text | YES | null |
| sportsnavi_id | text | YES | null |
| is_active | boolean | YES | true |
| npb_url | text | YES | null |

## 10. temp_npb_master
NPB公式サイトとの紐付けや、アクティブステータスの一時管理用マスターテーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_id | text | NO | null |
| player_name | text | YES | null |
| npb_url | text | YES | null |
| is_active | boolean | YES | false |

## 11. tmp_active_import
外部ソース等から現役選手情報をインポートする際の一時（ワーク）テーブル。

| カラム名 | データ型 | NULL許可 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| player_name | text | YES | null |
| team_name | text | YES | null |
| hometown | text | YES | null |
| blood_type | text | YES | null |
| years_pro | text | YES | null |
| salary_estimated | text | YES | null |
| raw_scouting_report | text | YES | null |
| linked_sportsnavi_id | text | YES | null |