const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const userId = "3841e124-15c1-44bb-9034-bde61410882d";
const tempSqlFile = path.join(__dirname, 'query.sql');
const edgeFunctionUrl = "https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ";

const cleanDb = () => {
  console.log("Cleaning up existing user memories...");
  const sql = `DELETE FROM user_memories WHERE user_id = '${userId}';`;
  fs.writeFileSync(tempSqlFile, sql, 'utf8');
  execSync(`npx supabase db query --linked -f "${tempSqlFile}"`);
  console.log("Database cleared.");
};

const getRowCount = () => {
  const sql = `SELECT count(*)::integer as count FROM user_memories WHERE user_id = '${userId}';`;
  fs.writeFileSync(tempSqlFile, sql, 'utf8');
  const outputStr = execSync(`npx supabase db query --linked -o json -f "${tempSqlFile}"`, { encoding: 'utf8' });
  const resData = JSON.parse(outputStr);
  return resData.rows?.[0]?.count || 0;
};

async function sendRequest() {
  const payload = {
    message: "Tolong ingat nama panggilan saya Pak Slamet",
    history: [],
    userId: userId,
    isRagEnabled: true,
    stream: false,
    tools: []
  };

  try {
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      },
      body: JSON.stringify(payload)
    });
    return res.status;
  } catch (e) {
    return e.message;
  }
}

async function runConcurrencyTest() {
  console.log("=== RUNNING CONCURRENT INSERTION TEST ===");
  cleanDb();

  const initialCount = getRowCount();
  console.log(`Initial memory count: ${initialCount} (Should be 0)`);
  if (initialCount !== 0) {
    console.error("Failed to clean database. Aborting.");
    return;
  }

  console.log("Sending 20 parallel identical memory saving requests...");
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(sendRequest());
  }

  const results = await Promise.all(promises);
  console.log("All 20 requests finished. HTTP statuses:", results.join(', '));

  console.log("Waiting 6 seconds for background save tasks to complete...");
  await new Promise(r => setTimeout(r, 6000));

  console.log("Fetching final memory count from database...");
  const finalCount = getRowCount();
  console.log(`Final memory count: ${finalCount}`);

  if (finalCount === 1) {
    console.log("Result: 🎉 SUCCESS (Exactly 1 row created, no duplication occurred!)");
  } else {
    console.log(`Result: ❌ FAILED (Found ${finalCount} rows, expected 1 due to duplication/race conditions)`);
  }

  // Cleanup temp SQL
  if (fs.existsSync(tempSqlFile)) {
    fs.unlinkSync(tempSqlFile);
  }
}

runConcurrencyTest();
