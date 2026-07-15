import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
      }
    });
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("No DB credentials found in .env. Skipping DB checks.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLegacy(table, column, fallbackCol = null) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  
  if (fallbackCol) {
     query = query.or(`${column}.eq.ws-owner,${column}.eq.ws-agent-forge,${fallbackCol}.eq.ws-owner,${fallbackCol}.eq.ws-agent-forge`);
  } else {
     query = query.in(column, ['ws-owner', 'ws-agent-forge']);
  }
  
  const { data, error, count } = await query;
  
  if (error) {
    if (error.code === 'PGRST204') {
        if (fallbackCol === null) {
            return await checkLegacy(table, 'workspace_type');
        }
    }
    console.log(`[${table}] Skipped or error: ${error.message}`);
    return;
  }
  
  if (count === 0) {
    console.log(`[${table}] SUCCESS: No legacy workspaces found.`);
  } else {
    console.warn(`[${table}] WARNING: Found ${count} legacy workspaces!`);
  }
}

async function run() {
  console.log("Verifying Database Tables for Legacy Concepts...");
  await checkLegacy('chats', 'workspace_id', 'workspace_type');
  await checkLegacy('user_memories', 'workspace_id');
  await checkLegacy('documents', 'space_id');
  await checkLegacy('evidence_audit_logs', 'workspace_id');
  await checkLegacy('api_usage', 'workspace_id');
}

run();
