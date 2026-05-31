const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs'); // CSV出力用

// --- 🛠 設定エリア ---
const SUPABASE_URL = 'https://wnzsahimcnxnxkkxfgdb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenNhaGltY254bnhra3hmZ2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3NzczMCwiZXhwIjoyMDg5OTUzNzMwfQ.w6-M0GEdteLs36UrYK3ykY1jbk2V-HIzdxKlaem70is';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CSV_FILE_PATH = './player_profiles_output.csv';

const TEAM_ID_MAP = {
    '巨人': 1, 'ヤクルト': 2, 'ＤｅＮＡ': 3, '中日': 4, '阪神': 5, '広島': 6,
    '西武': 7, 'ロッテ': 8, '日本ハム': 9, 'オリックス': 10, 'ソフトバンク': 11, '楽天': 12
};

const superNormalize = (str) => {
    if (!str) return "";
    return str
        .replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[\s　\.．・]/g, '')
        .toLowerCase()
        .trim();
};

async function enrichProfiles() {
    console.log('🚀 全選手プロフィール拡充＆CSV出力プロジェクトを開始します...');

    // 1. CSVのヘッダーを作成
    const header = "選手名,チーム,出身地,血液型,プロ通算年,年俸,寸評\n";
    fs.writeFileSync(CSV_FILE_PATH, header, 'utf8');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 2. Supabaseから全選手を取得（.limit を削除しました）
    const { data: players, error } = await supabase
        .from('players')
        .select('*')
        .order('player_id', { ascending: true }); // ID順に処理

    if (error) return console.error('❌ DBエラー:', error.message);

    console.log(`📊 処理対象: 全 ${players.length} 名`);

    const teamMasterLists = {};

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const teamId = TEAM_ID_MAP[Object.keys(TEAM_ID_MAP).find(k => player.team_name.includes(k))];
        const dbNameClean = superNormalize(player.player_name);

        console.log(`\n[${i + 1}/${players.length}] --- 🔍 ${player.player_name} (${player.team_name}) ---`);

        // 名簿マッピング
        if (teamId && !teamMasterLists[teamId]) {
            console.log(`    🛰 ${player.team_name} の名簿をロード中...`);
            teamMasterLists[teamId] = {};
            try {
                await page.goto(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/players`, { waitUntil: 'networkidle' });
                const $ = cheerio.load(await page.content());
                $(".bb-playerList__item").each((idx, el) => {
                    const id = $(el).find(".bb-playerList__link").attr('href')?.match(/player\/(\d+)/)?.[1];
                    const siteNameClean = superNormalize($(el).find(".bb-playerList__name").text());
                    if (id && siteNameClean) teamMasterLists[teamId][siteNameClean] = id;
                });
            } catch (e) { console.error(`    ❌ 一覧取得失敗`); }
        }

        let sponaviId = player.sportsnavi_id || (teamId ? teamMasterLists[teamId][dbNameClean] : null);

        // 曖昧検索（バックアップ）
        if (!sponaviId && teamId) {
            const fuzzyMatch = Object.entries(teamMasterLists[teamId]).find(([name]) => 
                name.includes(dbNameClean) || dbNameClean.includes(name)
            );
            if (fuzzyMatch) sponaviId = fuzzyMatch[1];
        }

        if (sponaviId) {
            let data = { hometown: "", bloodType: "", yearsPro: "", salary: "", report: "" };

            try {
                // 詳細ページ
                await page.goto(`https://baseball.yahoo.co.jp/npb/player/${sponaviId}/top`, { waitUntil: 'networkidle' });
                const $ = cheerio.load(await page.content());
                data.report = $("p.bb-paragraph").first().text().trim().replace(/,/g, '、'); // CSV対策でカンマを置換
                
                $("tr, dt").each((idx, el) => {
                    const label = $(el).text().trim();
                    const val = $(el).next().text().trim() || $(el).find('td').text().trim();
                    if (label.includes("出身地")) data.hometown = val;
                    if (label.includes("血液型")) data.bloodType = val;
                    if (label.includes("通算年")) data.yearsPro = val.match(/\d+/)?.[0] || "";
                });

                // 年俸ページ
                if (teamId) {
                    await page.goto(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/contract`, { waitUntil: 'networkidle' });
                    const $contract = cheerio.load(await page.content());
                    $contract(".bb-contractTable__row").each((idx, el) => {
                        const rowNameClean = superNormalize($contract(el).find('.bb-contractTable__data--player').text());
                        if (rowNameClean === dbNameClean || rowNameClean.includes(dbNameClean)) {
                            const rawSalary = $contract(el).find('.bb-contractTable__data--player').next().text().trim();
                            if (rawSalary) data.salary = `${rawSalary}万円（推定）`;
                            return false;
                        }
                    });
                }

                // Supabase更新
                await supabase.from('players').update({
                    sportsnavi_id: sponaviId,
                    hometown: data.hometown || player.hometown,
                    blood_type: data.bloodType || player.blood_type,
                    years_pro: data.yearsPro ? parseInt(data.yearsPro) : null,
                    salary_estimated: data.salary,
                    raw_scouting_report: data.report
                }).eq('player_id', player.player_id);

                // CSVに行を追加
                const csvRow = `"${player.player_name}","${player.team_name}","${data.hometown}","${data.bloodType}","${data.yearsPro}","${data.salary}","${data.report}"\n`;
                fs.appendFileSync(CSV_FILE_PATH, csvRow, 'utf8');

                console.log(`    ✅ 更新完了: [${data.hometown}] [${data.bloodType}] [${data.yearsPro}年] [${data.salary || '---'}]`);

            } catch (e) { console.error(`    ❌ 取得失敗: ${e.message}`); }
        } else {
            console.warn(`    ⚠️ ID特定不能: ${player.player_name}`);
        }

        // サーバーへの配慮（1.5秒待機）
        await page.waitForTimeout(1500);
    }

    await browser.close();
    console.log(`\n✨ すべての処理が完了しました！出力先: ${CSV_FILE_PATH}`);
}

enrichProfiles();