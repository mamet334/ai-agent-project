// MAEF Phase 1 — Runtime Verification Script
// Purpose: Confirm agent-process is live and policy logs are working
// Do NOT commit this to main branch (scratch file)

const SUPABASE_URL = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

async function checkAgentLogs() {
  console.log('=== MAEF Phase 1 — Runtime Verification ===\n');

  // 1. Check agent_logs for recent activity
  console.log('[1] Fetching recent agent_logs...');
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_logs?select=event_type,provider,message,created_at&order=created_at.desc&limit=10`,
      {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`
        }
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(`  agent_logs fetch failed: ${res.status} — ${err}`);
    } else {
      const data = await res.json();
      if (!data || data.length === 0) {
        console.log('  No recent agent_logs entries found (function may not have received requests yet).');
      } else {
        console.log(`  Found ${data.length} recent log entries:\n`);
        for (const row of data) {
          console.log(`  [${row.created_at}] event=${row.event_type} | provider=${row.provider}`);
          console.log(`    msg: ${String(row.message || '').substring(0, 120)}`);
        }
      }
    }
  } catch (e) {
    console.error('  agent_logs error:', e.message);
  }

  // 2. Verify health-check function is reachable (no auth needed)
  console.log('\n[2] Pinging health-check function...');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const body = await res.text();
    console.log(`  Status: ${res.status}`);
    console.log(`  Body: ${body.substring(0, 200)}`);
  } catch (e) {
    console.error('  health-check error:', e.message);
  }

  // 3. Verify agent-process is reachable (OPTIONS / preflight)
  console.log('\n[3] Pinging agent-process OPTIONS (CORS preflight)...');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-process`, {
      method: 'OPTIONS'
    });
    console.log(`  Status: ${res.status} (200 = CORS OK, function is alive)`);
    console.log(`  CORS header: ${res.headers.get('access-control-allow-origin')}`);
  } catch (e) {
    console.error('  agent-process OPTIONS error:', e.message);
  }

  console.log('\n=== Verification Complete ===');
}

checkAgentLogs();
