import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Starting DB Migration...");
  
  // 1. Update chats
  console.log("Migrating chats...");
  const { error: err1 } = await supabase.from('chats')
    .update({ workspace_type: 'ws-assistant' })
    .in('workspace_type', ['ws-owner', 'ws-agent-forge', 'OWNER', 'ASSISTANT', 'ws-knowledge', 'ws-memory']);
  if (err1) console.error("Error chats:", err1);

  // 2. Update user_memories
  console.log("Migrating user_memories...");
  const { error: err2 } = await supabase.from('user_memories')
    .update({ workspace_id: 'ws-assistant' })
    .in('workspace_id', ['ws-owner', 'ws-agent-forge', 'OWNER', 'ASSISTANT', 'ws-knowledge', 'ws-memory']);
  if (err2) console.error("Error user_memories:", err2);

  // 3. Update documents
  console.log("Migrating documents...");
  const { error: err3 } = await supabase.from('documents')
    .update({ space_id: 'ws-assistant' })
    .in('space_id', ['ws-owner', 'ws-agent-forge', 'OWNER', 'ASSISTANT', 'ws-knowledge', 'ws-memory']);
  if (err3) console.error("Error documents:", err3);

  // 4. Update evidence_audit_logs
  console.log("Migrating evidence_audit_logs...");
  const { error: err4 } = await supabase.from('evidence_audit_logs')
    .update({ workspace_id: 'ws-assistant' })
    .in('workspace_id', ['ws-owner', 'ws-agent-forge', 'OWNER', 'ASSISTANT', 'ws-knowledge', 'ws-memory']);
  if (err4) console.error("Error evidence_audit_logs:", err4);

  console.log("Migration complete.");
}

migrate();
