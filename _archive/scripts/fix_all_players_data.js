const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');

// --- 🛠 設定エリア：ここを書き換えてください ---
const SUPABASE_URL = 'https://wnzsahimcnxnxkkxfgdb.supabase.co'; 
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenNhaGltY254bnhra3hmZ2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3NzczMCwiZXhwIjoyMDg5OTUzNzMwfQ.w6-M0GEdteLs36UrYK3ykY1jbk2V-HIzdxKlaem70is'; 

// --- ⚠️ 実行前のチェック機能 ---
if (SUPABASE_URL.includes('あなたのURL')) {
    console.error('❌ エラー: SUPABASE_URL が書き換わっていません！SupabaseのURLを貼ってください。');
    process.exit(1);
}
if (SERVICE_ROLE_KEY.includes('あなたのSERVICE_ROLE_KEY')) {
    console.error('❌ エラー: SERVICE_ROLE_KEY が書き換わっていません！「service_role」の鍵を貼ってください。');
    process.exit(1);
}

// クライアント作成
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// 全角→半角変換関数
const toHalfWidth = (str) => {
    if (!str) return null;
    return str.replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
              .replace(/　/g, ' ');
};

async function fixAllPlayers() {
    console.log('🚀 プログラムを開始しました。データベースに接続中...');

    try {
        // 1. 全選手を取得
        const { data: players, error } = await supabase.from('players').select('*');

        if (error) {
            console.error('❌ Supabaseからデータが取れませんでした:', error.message);
            return;
        }

        console.log(`✅ ${players.length} 名の選手を発見しました。修正を開始します...`);

        for (const player of players) {
            const url = `https://npb.jp/bis/players/${player.player_id}.html`;
            
            try {
                const res = await axios.get(url, { timeout: 10000 });
                const $ = cheerio.load(res.data);

                // ドラフトと経歴の情報を取得
                const draftRaw = $("th:contains('ドラフト')").next().text().trim(); 
                const careerRaw = $("th:contains('経歴')").next().text().trim();

                // 「育成」の文字があれば true
                const isDev = draftRaw.includes('育成');

                const careerParts = careerRaw.split(' - ');
                
                const updateData = {
                    is_developmental: isDev,
                    high_school: toHalfWidth(careerParts[0]),
                    university: toHalfWidth(careerParts[1]),
                    prev_team_1: toHalfWidth(careerParts[2]),
                    hometown: toHalfWidth($("th:contains('出身地')").next().text().trim())
                };

                const { error: upError } = await supabase
                    .from('players')
                    .update(updateData)
                    .eq('player_id', player.player_id);

                if (upError) throw upError;
                console.log(`✅ [${isDev ? '育成' : '支配'}] ${player.player_name}`);

            } catch (err) {
                console.error(`❌ 取得失敗: ${player.player_name} (URL: ${url}) - ${err.message}`);
            }

            // NPBサーバーへの負荷対策（1.2秒待機）
            await new Promise(r => setTimeout(r, 1200));
        }

        console.log('\n✨ すべての修正が完了しました！');

    } catch (mainErr) {
        console.error('❌ 予期せぬエラーが発生しました:', mainErr.message);
    }
}

fixAllPlayers();