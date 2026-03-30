const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');

// --- 🛠 設定エリア ---
const SUPABASE_URL = 'https://wnzsahimcnxnxkkxfgdb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenNhaGltY254bnhra3hmZ2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3NzczMCwiZXhwIjoyMDg5OTUzNzMwfQ.w6-M0GEdteLs36UrYK3ykY1jbk2V-HIzdxKlaem70is';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const CSV_FILE_PATH = './player_profiles_output.csv';

// 💡 あなたのDB名とスポナビIDを1対1で完全固定
const TEAM_ID_MAP = {
    '読売ジャイアンツ': 1,
    '東京ヤクルトスワローズ': 2,
    '横浜DeNAベイスターズ': 3,
    '中日ドラゴンズ': 4,
    '阪神タイガース': 5,
    '広島東洋カープ': 6,
    '埼玉西武ライオンズ': 7,
    '北海道日本ハムファイターズ': 8,
    '千葉ロッテマリーンズ': 9,
    'オリックス・バファローズ': 11,
    '福岡ソフトバンクホークス': 12,
    '東北楽天ゴールデンイーグルス': 376
};

const superNormalize = (str) => {
    if (!str) return "";
    return str.replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
              .replace(/[\s　\.．・]/g, '')
              .toLowerCase()
              .trim();
};

async function recovery() {
    console.log('🚀 12球団完全一致リカバリーを開始します...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 💡 IDがまだ空の選手だけを抽出
    const { data: players, error } = await supabase
        .from('players')
        .select('*')
        .is('sportsnavi_id', null)
        .order('player_id', { ascending: true });

    if (error) return console.error('❌ DBエラー:', error.message);
    console.log(`📊 未完了選手: ${players.length} 名を処理します`);

    const teamMasterLists = {};

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const teamId = TEAM_ID_MAP[player.team_name]; // フルネームで直接引く
        const dbNameClean = superNormalize(player.player_name);

        if (!teamId) {
            console.warn(`    ⚠️ チーム名が一致しません: ${player.team_name}`);
            continue;
        }

        console.log(`\n[${i + 1}/${players.length}] --- 🔍 ${player.player_name} (${player.team_name} / ID:${teamId}) ---`);

        // (A) 名簿ロード（スクロール対応）
        if (!teamMasterLists[teamId]) {
            teamMasterLists[teamId] = {};
            console.log(`    🛰 一覧ページをフルロード中...`);
            try {
                await page.goto(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/players`, { waitUntil: 'networkidle' });
                
                // 最下部までスクロール（全員分表示）
                await page.evaluate(async () => {
                    await new Promise(resolve => {
                        let totalHeight = 0, distance = 200;
                        let timer = setInterval(() => {
                            let scrollHeight = document.body.scrollHeight;
                            window.scrollBy(0, distance);
                            totalHeight += distance;
                            if(totalHeight >= scrollHeight) { clearInterval(timer); resolve(); }
                        }, 100);
                    });
                });

                const $ = cheerio.load(await page.content());
                $(".bb-playerList__item").each((idx, el) => {
                    const id = $(el).find(".bb-playerList__link").attr('href')?.match(/player\/(\d+)/)?.[1];
                    const siteNameClean = superNormalize($(el).find(".bb-playerList__name").text());
                    if (id && siteNameClean) teamMasterLists[teamId][siteNameClean] = id;
                });
                console.log(`    ✅ ${player.team_name} の全IDを把握しました`);
            } catch (e) { console.error(`    ❌ ロード失敗`); }
        }

        // 照合
        let sponaviId = teamMasterLists[teamId][dbNameClean];

        // 曖昧検索（外国人選手などへの対応）
        if (!sponaviId) {
            const fuzzy = Object.entries(teamMasterLists[teamId]).find(([name]) => 
                name.includes(dbNameClean) || dbNameClean.includes(name)
            );
            if (fuzzy) sponaviId = fuzzy[1];
        }

        if (sponaviId) {
            try {
                // (B) 詳細・年俸の取得
                await page.goto(`https://baseball.yahoo.co.jp/npb/player/${sponaviId}/top`, { waitUntil: 'networkidle' });
                const $ = cheerio.load(await page.content());
                let data = { hometown: "", bloodType: "", yearsPro: "", salary: "", report: "" };
                data.report = $("p.bb-paragraph").first().text().trim().replace(/,/g, '、');
                
                $("tr, dt").each((idx, el) => {
                    const label = $(el).text().trim();
                    const val = $(el).next().text().trim() || $(el).find('td').text().trim();
                    if (label.includes("出身地")) data.hometown = val;
                    if (label.includes("血液型")) data.bloodType = val;
                    if (label.includes("通算年")) data.yearsPro = val.match(/\d+/)?.[0] || "";
                });

                await page.goto(`https://baseball.yahoo.co.jp/npb/teams/${teamId}/contract`, { waitUntil: 'networkidle' });
                const $contract = cheerio.load(await page.content());
                $contract(".bb-contractTable__row").each((idx, el) => {
                    const nameTd = $contract(el).find('.bb-contractTable__data--player');
                    const rowNameClean = superNormalize(nameTd.text());
                    if (rowNameClean === dbNameClean || rowNameClean.includes(dbNameClean)) {
                        const rawSalary = nameTd.next().text().trim();
                        if (rawSalary) data.salary = `${rawSalary}万円（推定）`;
                        return false;
                    }
                });

                // Supabase更新
                await supabase.from('players').update({
                    sportsnavi_id: sponaviId,
                    hometown: data.hometown || player.hometown,
                    blood_type: data.bloodType || player.blood_type,
                    years_pro: data.yearsPro ? parseInt(data.yearsPro) : null,
                    salary_estimated: data.salary,
                    raw_scouting_report: data.report
                }).eq('player_id', player.player_id);

                // CSV追記
                const csvRow = `"${player.player_name}","${player.team_name}","${data.hometown}","${data.bloodType}","${data.yearsPro}","${data.salary}","${data.report}"\n`;
                fs.appendFileSync(CSV_FILE_PATH, csvRow, 'utf8');
                console.log(`    ✅ 完了! [${player.player_name}] [${data.salary || '年俸不明'}]`);

            } catch (e) { console.error(`    ❌ 取得エラー`); }
        } else {
            console.warn(`    ❌ 特定不能: ${player.player_name}`);
        }
        await page.waitForTimeout(1000);
    }

    await browser.close();
    console.log('\n✨ すべての作業が完了しました！');
}

recovery();