import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { parseCognitiveIntent, bindCognitiveExecution } from './supabase/functions/agent-process/lib/context_optimizer.ts';

// Anda dapat mengganti ini dengan URL dan KEY Supabase lokal/production Anda saat testing
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'YOUR_SUPABASE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEST_USER_ID = "test_user_v2_" + Date.now();

async function runTests() {
  console.log("=========================================");
  console.log("🧠 MEMORY V2 VALIDATION SUITE STARTING");
  console.log("=========================================\n");

  // SEEDING DATA
  console.log("[SETUP] Seeding Data...");
  
  // Memori 1 (Old)
  const { data: mem1 } = await supabase.from('user_memories').insert({
      user_id: TEST_USER_ID,
      summary: 'Saya tinggal di Jakarta',
      memory_type: 'LOCATION',
      metadata: { bucket: 'HOME_BASE' }
  }).select('id').single();

  // Memori 2 (New - Overrides Memori 1)
  const { data: mem2 } = await supabase.from('user_memories').insert({
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
  await supabase.from('memory_relations').insert({ source_memory_id: loopA.id, target_memory_id: loopB.id, relation_type: 'REFINES' });
  await supabase.from('memory_relations').insert({ source_memory_id: loopB.id, target_memory_id: loopA.id, relation_type: 'REFINES' }); // INJECT LOOP

  console.log("[SETUP] Seed completed.\n");

  // ====================================================================
  // TEST 1: Location Changed (STATE_QUERY)
  // ====================================================================
  console.log("🧪 TEST 1: STATE_QUERY (Lokasi berubah Jakarta -> Surabaya)");
  let { data: res1 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['tinggal', 'domisili', 'surabaya', 'jakarta'], // Expanded keywords for candidate filtering
      p_intent_mode: 'STATE_QUERY',
      p_max_nodes: 5,
      p_max_edges: 0,
      p_traversal_depth: 0
  });

  const nodes1 = res1.nodes;
  const isSurabayaFound = nodes1.some(n => n.summary.includes('Surabaya'));
  const isJakartaHidden = !nodes1.some(n => n.summary.includes('Jakarta'));
  
  if (isSurabayaFound && isJakartaHidden) {
      console.log("✅ TEST 1 PASSED: Only Surabaya retrieved. Overridden node is hidden.");
  } else {
      console.error("❌ TEST 1 FAILED:", res1);
  }

  // ====================================================================
  // TEST 2: DELTA Query (Historical Traversal)
  // ====================================================================
  console.log("\n🧪 TEST 2: DELTA QUERY (Melacak histori Jakarta)");
  let { data: res2 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['tinggal', 'domisili', 'surabaya', 'jakarta'],
      p_intent_mode: 'DELTA',
      p_max_nodes: 5,
      p_max_edges: 5,
      p_traversal_depth: 2
  });

  const nodes2 = res2.nodes;
  const hasSurabaya = nodes2.some(n => n.summary.includes('Surabaya'));
  const hasJakarta = nodes2.some(n => n.summary.includes('Jakarta'));
  
  if (hasSurabaya && hasJakarta && res2.stats.edges_used > 0) {
      console.log("✅ TEST 2 PASSED: Both Surabaya and historical Jakarta retrieved. Edge used: " + res2.stats.edges_used);
  } else {
      console.error("❌ TEST 2 FAILED:", res2);
  }

  // ====================================================================
  // TEST 3: Graph Loop Traversal Protection
  // ====================================================================
  console.log("\n🧪 TEST 3: GRAPH LOOP PROTECTION (A -> B -> A)");
  let { data: res3 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['A', 'B'], 
      p_intent_mode: 'ANALYTIC',
      p_max_nodes: 10,
      p_max_edges: 10,
      p_traversal_depth: 5 // Coba traversal dalam, tapi kena loop
  });

  if (res3.stats.depth_reached < 5) {
      console.log("✅ TEST 3 PASSED: Loop detected and traversal stopped at depth " + res3.stats.depth_reached);
  } else {
      console.error("❌ TEST 3 FAILED: Traversal did not stop safely.");
  }

  // ====================================================================
  // TEST 4: Hard Budget Limit
  // ====================================================================
  console.log("\n🧪 TEST 4: BUDGET LIMIT (max_nodes = 1)");
  let { data: res4 } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: TEST_USER_ID,
      p_keywords: ['surabaya', 'jakarta', 'A', 'B'], 
      p_intent_mode: 'ANALYTIC',
      p_max_nodes: 1, // Memaksa limit 1 node
      p_max_edges: 5,
      p_traversal_depth: 5
  });

  if (res4.stats.nodes_used <= 1 && res4.stats.budget_exhausted === true) {
      console.log("✅ TEST 4 PASSED: Strict budget enforced. Nodes used = " + res4.stats.nodes_used);
  } else {
      console.error("❌ TEST 4 FAILED: Budget limit breached.", res4.stats);
  }

  console.log("\n=========================================");
  console.log("🎉 ALL TESTS EXECUTED");
  console.log("=========================================");
}

runTests();
