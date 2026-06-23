const data = [
  {
    id: '4b5dec61-de0d-43b8-b295-c5694578ee4b',
    summary: 'Nama panggilan user adalah Pak Slamet.',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 1.0,
    memory_hits: 10,
    memory_state: 'STABILIZED'
  },
  {
    id: '52b254ce-659b-4439-92d0-2559734387c9',
    summary: 'Saya tinggal di bandung hari ini',
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 1.0,
    memory_hits: 5,
    memory_state: 'STABILIZED'
  },
  {
    id: '7aa4be7c-763d-4528-8597-8edd08635b6a',
    summary: 'saya juga suka teh',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 1.0,
    memory_hits: 1
  },
  {
    id: 'b7bbb796-2705-484d-b37d-b2e27dfbad5a',
    summary: 'Catatan riset: Binance memiliki volume derivatif terbesar di industri kripto.',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 1.0,
    memory_hits: 1
  },
  {
    id: 'c44434a7-8418-40fd-9f08-da1a6aa22415',
    summary: 'Sekarang saya tinggal di jakarta',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 1.0,
    memory_hits: 1
  },
  {
    id: 'dbc6e5ab-39d0-41bc-bdc3-5179184789ec',
    summary: 'aku kerja di startup AI',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 1.0,
    memory_hits: 1
  },
  {
    id: 'e1e93f0b-90f2-4f34-aafb-ca441fc7d0c6',
    summary: 'saya suka kopi',
    created_at: new Date().toISOString(),
    confidence: 1.0,
    memory_hits: 2
  }
];

const userPrompt = "sebelum saya tinggal di bandung, saya tinggal di mana?";
const promptLower = userPrompt.toLowerCase();
const keywords = promptLower.split(/[\s\p{P}]+/).filter(w => w.length > 3);

console.log("━━━━━━━━━━━━━━━━━━━━━━━\nSTEP 2 — RETRIEVAL TRACE\n━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Query:", userPrompt);
console.log("Keywords:", keywords);

const scoredMemories = data.map((mem, index) => {
   let score = 0;
   const memLower = mem.summary.toLowerCase();
   
   if (promptLower.includes(memLower) || memLower.includes(promptLower)) {
      score += 5;
   }
   
   for (const kw of keywords) {
      if (memLower.includes(kw)) score += 2;
   }
   
   if (index < 3) score += 1;
   
   const relevanceScore = score;
   const confidenceScore = mem.confidence || 1.0;
   const ageDays = (Date.now() - new Date(mem.created_at).getTime()) / (1000 * 60 * 60 * 24);
   const recencyScore = Math.max(0, 100 - (ageDays * 2));
   const frequencyScore = Math.min(100, (mem.memory_hits || 0) * 10);
   
   let stateModifier = 0;
   if (mem.memory_state === 'STABILIZED') stateModifier = 15.0;
   else if (mem.memory_state === 'CONFLICTED') stateModifier = -20.0;
   
   const cognitiveDepth = 0;
   const truthVerification = 0;

   const finalScore = (relevanceScore * 0.4) + (confidenceScore * 30.0) + (recencyScore * 0.2) + (frequencyScore * 0.1) + stateModifier + cognitiveDepth + truthVerification;
   
   return {
       id: mem.id,
       memory_text: mem.summary,
       keyword_score: relevanceScore,
       recency_score: recencyScore.toFixed(2),
       frequency_score: frequencyScore,
       confidence_score: confidenceScore,
       state_modifier: stateModifier,
       final_score: finalScore.toFixed(4)
   };
});

console.log(JSON.stringify(scoredMemories, null, 2));

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━\nSTEP 3 — RANKING PROOF\n━━━━━━━━━━━━━━━━━━━━━━━");

scoredMemories.sort((a, b) => parseFloat(b.final_score) - parseFloat(a.final_score));

scoredMemories.forEach((mem, idx) => {
    console.log(`Rank #${idx + 1}`);
    console.log(`Memory: ${mem.memory_text}`);
    console.log(`Score: ${mem.final_score}\n`);
});

console.log("━━━━━━━━━━━━━━━━━━━━━━━\nSTEP 4 — TOP-K CUT ANALYSIS\n━━━━━━━━━━━━━━━━━━━━━━━");

const topMemories = scoredMemories.slice(0, 5);

console.log("BEFORE CUT:");
console.log(scoredMemories.map((m, i) => `Rank #${i+1} (${m.final_score}): ${m.memory_text}`).join('\n'));
console.log("\nAFTER CUT (slice(0, 5)):");
console.log(topMemories.map((m, i) => `Rank #${i+1} (${m.final_score}): ${m.memory_text}`).join('\n'));

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━\nSTEP 5 — CONTEXT BUILDER TRACE\n━━━━━━━━━━━━━━━━━━━━━━━");

let memoryPrompt = "[MEMORI GLOBAL & PREFERENSI USER]:\n[ROLE]: Executive AI...\n[MEMORY - PRIORITY 3]\n";
topMemories.forEach(m => {
    memoryPrompt += `- ${m.memory_text}\n`;
});
console.log("memoryPrompt hasil akhir:\n" + memoryPrompt);

console.log("━━━━━━━━━━━━━━━━━━━━━━━\nSTEP 6 — FINAL PROMPT TRACE\n━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Apakah string 'jakarta' masih ada? ${memoryPrompt.includes("jakarta") ? 'YES' : 'NO'}`);

console.log("━━━━━━━━━━━━━━━━━━━━━━━\nSTEP 7 — ROOT CAUSE VERDICT\n━━━━━━━━━━━━━━━━━━━━━━━");
console.log("D. Top-K truncation");
