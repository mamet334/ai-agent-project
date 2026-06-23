import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

async function fetchSupabase(table, select = '*') {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${select}&order=created_at.desc&limit=10`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  return res.json();
}

async function checkLogs() {
  console.log("Fetching agent_logs...");
  const logs = await fetchSupabase('agent_logs');
  console.log(JSON.stringify(logs, null, 2));

  console.log("Fetching user_memories...");
  const mems = await fetchSupabase('user_memories', 'content,memory_state,created_at');
  console.log(JSON.stringify(mems, null, 2));
}

checkLogs();
