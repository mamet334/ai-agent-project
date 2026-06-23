import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function trace() {
    const userId = "3841e124-15c1-44bb-9034-bde61410882d";
    const userPrompt = "sebelum saya tinggal di bandung, saya tinggal di mana?";
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 1 — DATABASE PROOF");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    let { data, error } = await supabase.from('user_memories').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(15);
    
    if (error) {
        console.error("DB Error", error);
        return;
    }
    
    for (const mem of data) {
        if (mem.summary.includes("jakarta")) {
            console.log(JSON.stringify({
                id: mem.id,
                summary: mem.summary,
                created_at: mem.created_at,
                confidence: mem.confidence,
                memory_hits: mem.memory_hits,
                memory_type: mem.memory_type
            }, null, 2));
        }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 2 — RETRIEVAL TRACE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Exact logic from memory_manager_v1.ts
    const promptLower = userPrompt.toLowerCase();
    const keywords = promptLower.split(/[\s\p{P}]+/).filter(w => w.length > 3);
    console.log("Query:", userPrompt);
    console.log("Keywords:", keywords);
    
    const uniqueMemoriesMap = new Map();
    for (const d of data) {
       if (!uniqueMemoriesMap.has(d.summary.toLowerCase())) {
          uniqueMemoriesMap.set(d.summary.toLowerCase(), d);
       }
    }
    const uniqueMemories = Array.from(uniqueMemoriesMap.values());
    
    const scoredMemories = uniqueMemories.map((mem, index) => {
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
       
       const cognitiveDepth = (mem.reasoning_depth_score || 0) * 10.0;
       const truthVerification = (mem.truth_verification_score || 0) * 10.0;

       const finalScore = (relevanceScore * 0.4) + (confidenceScore * 30.0) + (recencyScore * 0.2) + (frequencyScore * 0.1) + stateModifier + cognitiveDepth + truthVerification;
       
       return { 
           memory_text: mem.summary,
           keyword_score: relevanceScore,
           recency_score: recencyScore,
           frequency_score: frequencyScore,
           confidence_score: confidenceScore,
           final_score: finalScore
       };
    });
    
    console.log(JSON.stringify(scoredMemories, null, 2));

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 3 — RANKING PROOF");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Sort
    scoredMemories.sort((a, b) => b.final_score - a.final_score);
    
    scoredMemories.forEach((mem, idx) => {
        console.log(`Rank #${idx + 1}`);
        console.log(`Memory: ${mem.memory_text}`);
        console.log(`Score: ${mem.final_score.toFixed(4)}\n`);
    });
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 4 — TOP-K CUT ANALYSIS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    
    const topMemories = scoredMemories.slice(0, 5);
    
    console.log("BEFORE CUT:");
    console.log(scoredMemories.map((m, i) => `Rank #${i+1} (${m.final_score.toFixed(2)}): ${m.memory_text}`).join('\n'));
    console.log("\nAFTER CUT (slice(0, 5)):");
    console.log(topMemories.map((m, i) => `Rank #${i+1} (${m.final_score.toFixed(2)}): ${m.memory_text}`).join('\n'));
    
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 5 — CONTEXT BUILDER TRACE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    
    let memoryPrompt = "[MEMORI GLOBAL & PREFERENSI USER]:\n";
    memoryPrompt += "[ROLE]: Executive AI, Tech Co-Founder. Strategic, precise, no fluff.\n";
    memoryPrompt += "[RULES]:\n1. DIRECT: Answer first. No \"As an AI...\".\n2. FORMAT: Bullets/Lists. Markdown Tables (data). Mermaid (workflows).\n3. FACTS ONLY: If data missing = \"[ERROR: DATA TIDAK TERSEDIA]\". No hallucination.\n4. CRITICAL: Challenge illogical request.\n5. THINKING: Always show reasoning process.\n6. CLOSING: End with 1-sentence conclusion OR execution question.\n\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)\n\n[MEMORY - PRIORITY 3]\n";
    
    topMemories.forEach(m => {
        memoryPrompt += `- ${m.memory_text}\n`;
    });
    
    console.log("memoryPrompt hasil akhir:");
    console.log(memoryPrompt);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 6 & 7 — ROOT CAUSE VERDICT");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Apakah string 'jakarta' masih ada? " + memoryPrompt.includes("jakarta"));

}

trace();
