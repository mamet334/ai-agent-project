const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const geminiKey = "AIzaSyBFSdQ5IcTymDBYNyE8I5S2QL2Toijv1KQ";
const userId = "3841e124-15c1-44bb-9034-bde61410882d";
const tempSqlFile = path.join(__dirname, 'query.sql');

const queries = [
  "siapa nama saya",
  "nama saya siapa",
  "saya dipanggil siapa",
  "apakah kamu ingat nama saya",
  "panggilan saya apa"
];

async function getEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      outputDimensionality: 768
    })
  });
  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }
  const data = await response.json();
  return data.embedding?.values || [];
}

async function runRetrievalTest() {
  console.log("=== RUNNING RETRIEVAL ACCURACY TEST SUITE ===");
  
  // Make sure target memory exists
  const insertSql = `
    INSERT INTO user_memories (user_id, summary, normalized_memory_hash)
    VALUES ('${userId}', 'Nama panggilan user adalah Pak Slamet', md5('namapanggilanuseradalahpakslamet'))
    ON CONFLICT (user_id, normalized_memory_hash) DO NOTHING;
  `;
  fs.writeFileSync(tempSqlFile, insertSql, 'utf8');
  execSync(`npx supabase db query --linked -f "${tempSqlFile}"`);

  let passed = 0;

  for (const q of queries) {
    try {
      const embedding = await getEmbedding(q);
      if (embedding.length !== 768) {
        console.error(`Query: "${q}" -> Failed to get embedding`);
        continue;
      }

      const vectorStr = `[${embedding.join(',')}]`;
      const sql = `
        SELECT summary, similarity 
        FROM match_memories('${vectorStr}'::vector, 0.65, 5, '${userId}');
      `;
      fs.writeFileSync(tempSqlFile, sql, 'utf8');
      
      const outputStr = execSync(`npx supabase db query --linked -o json -f "${tempSqlFile}"`, { encoding: 'utf8' });
      const resData = JSON.parse(outputStr);
      const rows = resData.rows || [];

      console.log(`Query: "${q}"`);
      if (rows.length === 0) {
        console.log("  Result: ❌ FAILED (No matching memory found at threshold 0.65)");
      } else {
        rows.forEach(row => {
          const score = parseFloat(row.similarity);
          const stage = score >= 0.75 ? "Stage 1 (High Precision)" : "Stage 2 (Expanded Recall)";
          console.log(`  Match: "${row.summary}"`);
          console.log(`  Similarity: ${score.toFixed(4)} (${stage})`);
          if (row.summary.includes("Pak Slamet")) {
            console.log(`  Result: ✅ PASSED`);
            passed++;
          } else {
            console.log(`  Result: ❌ FAILED (Incorrect memory matched)`);
          }
        });
      }
      console.log("-".repeat(50));
    } catch (e) {
      console.error(`Error with query "${q}":`, e.message);
    }
  }

  // Cleanup
  if (fs.existsSync(tempSqlFile)) {
    fs.unlinkSync(tempSqlFile);
  }

  console.log(`\nRetrieval Accuracy Results: ${passed} / ${queries.length} queries successfully recalled.`);
}

runRetrievalTest();
