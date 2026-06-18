const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const tempSqlFile = path.join(__dirname, 'query_temp.sql');

function runSql(sql) {
  fs.writeFileSync(tempSqlFile, sql, 'utf8');
  const out = execSync(`npx supabase db query --linked -o json -f "${tempSqlFile}"`, { encoding: 'utf8' });
  if (fs.existsSync(tempSqlFile)) fs.unlinkSync(tempSqlFile);
  return JSON.parse(out);
}

const userId = "3841e124-15c1-44bb-9034-bde61410882d";

// List all memories
const listResult = runSql(`SELECT id, user_id, summary FROM user_memories WHERE user_id = '${userId}';`);
console.log("Current memories for user:");
console.table(listResult.rows);

// Delete bad ones
const delResult = runSql(`
  DELETE FROM user_memories 
  WHERE user_id = '${userId}' 
  AND (summary ILIKE '%Maaf%' OR summary ILIKE '%tidak menemukan%' OR summary ILIKE '%tidak ada fakta%');
`);
console.log("Deleted bad memories. Rows affected:", delResult.rowCount ?? "unknown");

// Verify remaining
const afterResult = runSql(`SELECT id, user_id, summary FROM user_memories WHERE user_id = '${userId}';`);
console.log("Remaining memories:");
console.table(afterResult.rows);
