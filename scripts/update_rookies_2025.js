const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// --- 設定エリア ---
const SUPABASE_URL = 'https://wnzsahimcnxnxkkxfgdb.supabase.co'; // SupabaseのProject URL
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenNhaGltY254bnhra3hmZ2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3NzczMCwiZXhwIjoyMDg5OTUzNzMwfQ.w6-M0GEdteLs36UrYK3ykY1jbk2V-HIzdxKlaem70is'; // ※anonキーではなくservice_roleキー

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const csvWriter = createCsvWriter({
  path: 'rookies_2025_results.csv',
  header: [
    {id: 'name', title: '名前'},
    {id: 'career', title: '経歴'},
    {id: 'draft', title: 'ドラフト'},
    {id: 'status', title: '状態'}
  ]
});

async function updateRookies() {
  console.log('🚀 2025年新人選手の更新を開始します...');

  // 1. draft_yearが2025の選手を取得
  const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .or('draft_year.eq.2025,draft_year.eq."2025"');

  if (error || !players || players.length === 0) {
    console.error('❌ 対象選手が見つかりませんでした。', error);
    return;
  }

  const results = [];

  for (const player of players) {
    // 画像に基づき、player_id をそのまま NPB の ID として使用
    const npbId = player.player_id;
    const url = `https://npb.jp/bis/players/${npbId}.html`;
    
    console.log(`\n--- 🔍 ${player.player_name} (${npbId}) を取得中 ---`);

    try {
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);

      // スクショの項目名に合わせて抽出
      const careerRaw = $("th:contains('経歴')").next().text().trim(); // "高川学園高 - 創価大"
      const draftRaw = $("th:contains('ドラフト')").next().text().trim();  // "2025年ドラフト1位"
      const birthday = $("th:contains('生年月日')").next().text().trim();
      const hwRaw = $("th:contains('身長／体重')").next().text().trim(); // "180cm／87kg"

      // 経歴を高校と大学に分解（ハイフンで分かれている場合）
      const careerParts = careerRaw.split(' - ');
      const highSchool = careerParts[0] || null;
      const university = careerParts[1] || null;

      // 身長・体重の分解
      const height = hwRaw.match(/(\d+)cm/)?.[1] || null;
      const weight = hwRaw.match(/(\d+)kg/)?.[1] || null;

      // 2. Supabaseを更新
      const { error: upError } = await supabase
        .from('players')
        .update({
          high_school: highSchool,
          university: university,
          birthday: birthday,
          height: height,
          weight: weight,
          draft_year: 2025 // 念のため数値を再セット
        })
        .eq('player_id', player.player_id);

      if (upError) throw upError;

      console.log(`✅ 更新成功: ${careerRaw}`);
      results.push({ name: player.player_name, career: careerRaw, draft: draftRaw, status: '成功' });

    } catch (err) {
      console.error(`❌ 失敗: ${player.player_name} (URL: ${url})`);
      console.error(`   理由: ${err.message}`);
      results.push({ name: player.player_name, career: '', draft: '', status: `失敗: ${err.message}` });
    }

    // NPBへの負荷対策で1.5秒待機
    await new Promise(r => setTimeout(r, 1500));
  }

  await csvWriter.writeRecords(results);
  console.log('\n✨ すべての処理が完了しました。');
  console.log('手元用データ：rookies_2025_results.csv を作成しました。');
}

updateRookies();