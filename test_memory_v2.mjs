import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEST_USER_ID = "test_user_v2_" + Date.now();

async function runTests() {
  console.log("=========================================");
  console.log("🧠 MEMORY V2 VALIDATION SUITE STARTING");
  console.log("=========================================\n");

  // SEEDING DATA
  console.log("[SETUP] Seeding Data...");
  
  // Memori 1 (Old)
  const { data: mem1, error: e1 } = await supabase.from('user_memories').insert({
      user_id: TEST_USER_ID,
      summary: 'Saya tinggal di Jakarta',
      memory_type: 'LOCATION',
      metadata: { bucket: 'HOME_BASE' }
  }).select('id').single();

  if (e1) {
      console.error("Setup error (Mem1):", e1.message);
      if (e1.code === '42501') console.log("⚠️ RLS memblokir insert via Anon Key. Mohon matikan RLS untuk testing atau gunakan Service Role Key.");
      return;
  }

  // Memori 2 (New - Overrides Memori 1)
  const { data: mem2, error: e2 } = await supabase.from('user_memories').insert({
      user_id: TEST_USER_ID,
      summary: 'Sekarang domisili di Surabaya',
      memory_type: 'LOCATION',
      metadata: { bucket: 'HOME_BASE' }
  }).select('id').single();

  // Edge (Mem 2 OVERRIDES Mem 1)
  await supabase.from('memory_relations').insert({
      source_memory_id: mem1.id,
      target_memory_id: mem2.id,
      relation_type: 'OVERRIDES',
      reason_type: 'user_explicit_correction'
  });

  // Memori 3 (Loop Test)
  const { data: loopA } = await supabase.from('user_memories').insert({ user_id: TEST_USER_ID, summary: 'A', memory_type: 'FACT' }).select('id').single();
  const { data: loopB } = await supabase.from('user_memories').insert({ user_id: TEST_USER_ID, summary: 'B', memory_type: 'FACT' }).select('id').single();
  
  if (loopA && loopB) {
      await supabase.from('memory_relations').insert({ source_memory_id: loopA.id, target_memory_id: loopB.id, relation_type: 'REFINES' });
      await supabase.from('memory_relations').insert({ source_memory_id: loopB.id, target_memory_id: loopA.id, relation_type: 'REFINES' }); // INJECT LOOP
  }

  console.log("[SETUP] Seed completed.\n");

  // ====================================================================
  // TEST 1: Location Changed (STATE_QUERY)
  // ====================================================================
  console.log("🧪 TEST 1: STATE_QUERY (Lokasi berubah Jakarta -> Surabaya)");
  let { data: res1, error: err1 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['tinggal', 'domisili', 'surabaya', 'jakarta'],
      p_intent_mode: 'STATE_QUERY',
      p_max_nodes: 5,
      p_max_edges: 0,
      p_traversal_depth: 0
  });

  if (err1) {
      console.error("❌ TEST 1 FAILED (RPC Error):", err1.message);
  } else {
      const nodes1 = res1.nodes;
      const isSurabayaFound = nodes1.some(n => n.summary.includes('Surabaya'));
      const isJakartaHidden = !nodes1.some(n => n.summary.includes('Jakarta'));
      
      if (isSurabayaFound && isJakartaHidden) {
          console.log("✅ TEST 1 PASSED: Only Surabaya retrieved. Overridden node is hidden.");
          console.log("   Output Nodes:", nodes1.map(n => n.summary));
      } else {
          console.error("❌ TEST 1 FAILED. Output:", nodes1.map(n => n.summary));
      }
  }

  // ====================================================================
  // TEST 2: DELTA Query (Historical Traversal)
  // ====================================================================
  console.log("\n🧪 TEST 2: DELTA QUERY (Melacak histori Jakarta)");
  let { data: res2, error: err2 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['tinggal', 'domisili', 'surabaya', 'jakarta'],
      p_intent_mode: 'DELTA',
      p_max_nodes: 5,
      p_max_edges: 5,
      p_traversal_depth: 2
  });

  if (err2) {
      console.error("❌ TEST 2 FAILED (RPC Error):", err2.message);
  } else {
      const nodes2 = res2.nodes;
      const hasSurabaya = nodes2.some(n => n.summary.includes('Surabaya'));
      const hasJakarta = nodes2.some(n => n.summary.includes('Jakarta'));
      
      if (hasSurabaya && hasJakarta && res2.stats.edges_used > 0) {
          console.log("✅ TEST 2 PASSED: Both Surabaya and historical Jakarta retrieved. Edge used: " + res2.stats.edges_used);
          console.log("   Output Nodes:", nodes2.map(n => n.summary));
      } else {
          console.error("❌ TEST 2 FAILED. Output:", nodes2.map(n => n.summary), "\n   Stats:", res2.stats);
      }
  }

  // ====================================================================
  // TEST 3: Graph Loop Traversal Protection
  // ====================================================================
  console.log("\n🧪 TEST 3: GRAPH LOOP PROTECTION (A -> B -> A)");
  let { data: res3, error: err3 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['A', 'B'], 
      p_intent_mode: 'ANALYTIC',
      p_max_nodes: 10,
      p_max_edges: 10,
      p_traversal_depth: 5 // Coba traversal dalam, tapi kena loop
  });

  if (err3) {
      console.error("❌ TEST 3 FAILED (RPC Error):", err3.message);
  } else {
      if (res3.stats.depth_reached < 5) {
          console.log("✅ TEST 3 PASSED: Loop detected and traversal stopped at depth " + res3.stats.depth_reached);
      } else {
          console.error("❌ TEST 3 FAILED: Traversal did not stop safely.");
      }
  }

  // ====================================================================
  // TEST 4: Hard Budget Limit
  // ====================================================================
  console.log("\n🧪 TEST 4: BUDGET LIMIT (max_nodes = 1)");
  let { data: res4, error: err4 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['surabaya', 'jakarta', 'A', 'B'], 
      p_intent_mode: 'ANALYTIC',
      p_max_nodes: 1, // Memaksa limit 1 node
      p_max_edges: 5,
      p_traversal_depth: 5
  });

  if (err4) {
      console.error("❌ TEST 4 FAILED (RPC Error):", err4.message);
  } else {
      if (res4.stats.nodes_used <= 1 && res4.stats.budget_exhausted === true) {
          console.log("✅ TEST 4 PASSED: Strict budget enforced. Nodes used = " + res4.stats.nodes_used);
          console.log("   Stats:", res4.stats);
      } else {
          console.error("❌ TEST 4 FAILED: Budget limit breached.", res4.stats);
      }
  }

  console.log("\n=========================================");
  console.log("🎉 ALL TESTS EXECUTED");
  console.log("=========================================");
}

runTests();
