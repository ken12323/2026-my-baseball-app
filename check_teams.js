// check_teams.js
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://wnzsahimcnxnxkkxfgdb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenNhaGltY254bnhra3hmZ2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3NzczMCwiZXhwIjoyMDg5OTUzNzMwfQ.w6-M0GEdteLs36UrYK3ykY1jbk2V-HIzdxKlaem70is';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkTeams() {
    const { data, error } = await supabase.from('players').select('team_name');
    if (error) return console.error(error);
    
    // 重複を排除して一覧表示
    const teams = [...new Set(data.map(d => d.team_name))];
    console.log("--- あなたのDBにあるチーム名一覧 ---");
    console.log(teams);
}
checkTeams();