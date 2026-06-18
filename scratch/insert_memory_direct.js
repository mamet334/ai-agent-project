const { execSync } = require('child_process');

const geminiKey = "AIzaSyBFSdQ5IcTymDBYNyE8I5S2QL2Toijv1KQ";
const userId = "3841e124-15c1-44bb-9034-bde61410882d";
const factText = "Nama panggilan user adalah Pak Slamet";

async function run() {
  try {
    // 1. Get embedding
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`;
    console.log("Generating embedding for:", factText);
    const res = await fetch(embedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: factText }] },
        outputDimensionality: 768
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Embedding failed: ${JSON.stringify(data)}`);
    }

    const embedding = data.embedding?.values;
    console.log("Embedding generated. Dimensions:", embedding.length);

    // 2. Format embedding array for Postgres vector representation: '[v1, v2, ...]'
    const vectorStr = `[${embedding.join(',')}]`;

    // 3. Construct SQL Query to insert
    const sql = `INSERT INTO user_memories (user_id, summary, embedding) VALUES ('${userId}', '${factText.replace(/'/g, "''")}', '${vectorStr}');`;
    
    const fs = require('fs');
    const path = require('path');
    const tempFilePath = path.join(__dirname, 'temp_insert.sql');
    fs.writeFileSync(tempFilePath, sql);

    console.log("Inserting into remote database using Supabase CLI with file flag...");
    // Run CLI query with file flag
    const output = execSync(`npx supabase db query --linked -f scratch/temp_insert.sql`, { encoding: 'utf-8' });
    console.log("Result:", output);

    // Cleanup temp file
    fs.unlinkSync(tempFilePath);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
