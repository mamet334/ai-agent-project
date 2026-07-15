import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
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
        // Column not found, let's try workspace_type
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
