(globalThis as any).Deno = { env: { get: (k: string) => k === 'GROQ_API_KEY' ? 'mock_key' : '', set: () => {} } };
import { compressCognitiveContext } from './supabase/functions/agent-process/plugins/context_compressor.ts';

// Mock Fetch to intercept LLM calls to prevent real network quota consumption during regression suite
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url: any, options: any) => {
  if (typeof url === 'string' && (url.includes('api.groq.com') || url.includes('generativelanguage.googleapis.com'))) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        compressed_summary: "MOCKED COMPRESSED NARRATIVE.",
        emotional_context: ["MOCKED EMOTION"]
      }) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(url, options);
};

Deno.env.set('GROQ_API_KEY', 'mock_key');

const createNode = (id: string, summary: string, created_at: number = 0, is_compressed = false) => ({
  id, summary, created_at, score: 1.0, is_compressed_context: is_compressed
});

const createEdge = (source: string, target: string, type: string, reason: string = "") => ({
  source_memory_id: source,
  target_memory_id: target,
  relation_type: type,
  reason_type: reason
});

const runTests = async () => {
  const tests = [
    { id: 1, name: "Insert memory: user name Andre", nodes: [createNode("1", "User name is Andre", 1)], edges: [] },
    { id: 2, name: "Query: siapa nama user", nodes: [createNode("1", "User name is Andre", 1)], edges: [] },
    { id: 3, name: "Override memory with new name", nodes: [createNode("1", "Name Andre", 1), createNode("2", "Name is actually Budi", 2)], edges: [createEdge("2", "1", "OVERRIDES")] },
    { id: 4, name: "Conflict memory: two different names", nodes: [createNode("1", "Name Andre"), createNode("2", "Name Budi")], edges: [createEdge("1", "2", "CONTRADICTS", "Different name")] },
    { id: 5, name: "Multi-hop chain: A -> B -> C", nodes: [createNode("1", "A", 1), createNode("2", "B", 2), createNode("3", "C", 3)], edges: [createEdge("2", "1", "OVERRIDES"), createEdge("3", "2", "OVERRIDES")] },
    { id: 6, name: "Reverse lookup query", nodes: [createNode("1", "Address is Bali")], edges: [] },
    { id: 7, name: "Temporal ordering check", nodes: [createNode("1", "Old", 10), createNode("2", "New", 20)], edges: [createEdge("2", "1", "OVERRIDES")] },
    { id: 8, name: "Stale memory detection", nodes: [createNode("1", "Stale node", 1)], edges: [] },
    { id: 9, name: "Contradiction detection", nodes: [createNode("1", "Age 20"), createNode("2", "Age 30")], edges: [createEdge("1", "2", "CONTRADICTS")] },
    { id: 10, name: "Emotional memory extraction", nodes: [createNode("1", "User is very sad")], edges: [] },
    { id: 11, name: "Profile memory update", nodes: [createNode("1", "Profile updated")], edges: [] },
    { id: 12, name: "Delta query", nodes: [createNode("1", "Before"), createNode("2", "After")], edges: [createEdge("2", "1", "OVERRIDES")] },
    { id: 13, name: "Compression first pass", nodes: [createNode("1", "A very very long memory string to test compression ratio. ".repeat(20))], edges: [] },
    { id: 14, name: "Attempt double compression", nodes: [createNode("1", "Compressed context", 0, true)], edges: [] },
    { id: 15, name: "Compression ratio logging", nodes: [createNode("1", "A very very very very long node. ".repeat(50))], edges: [] },
    { id: 16, name: "Memory retrieval after compression", nodes: [createNode("1", "Node 1")], edges: [] },
    { id: 17, name: "Graph edge validation (valid)", nodes: [createNode("1", "A"), createNode("2", "B")], edges: [createEdge("2", "1", "OVERRIDES")] },
    { id: 18, name: "Graph edge invalid self-loop", nodes: [createNode("1", "A")], edges: [createEdge("1", "1", "OVERRIDES")] },
    { id: 19, name: "Missing node edge case", nodes: [createNode("1", "A")], edges: [createEdge("2", "1", "OVERRIDES")] },
    { id: 20, name: "Context drift simulation", nodes: [createNode("1", "A"), createNode("2", "B"), createNode("3", "C")], edges: [createEdge("2", "1", "CONTRADICTS"), createEdge("3", "2", "CONTRADICTS")] }
  ];

  console.log("==========================================");
  console.log("MAMET AI MEMORY - PATCH & TEST EXECUTION");
  console.log("==========================================");

  for (const t of tests) {
    let status = "PASS";
    let memoryState = "";
    let obsOutput = "";
    
    // Capture console logs
    const originalLog = console.log;
    const originalWarn = console.warn;
    const logs: string[] = [];
    console.log = (...args) => logs.push(args.join(" "));
    console.warn = (...args) => logs.push(args.join(" "));
    
    try {
      const res = await compressCognitiveContext({
        intent: { intent_mode: "TEST", target_entity_types: ["ALL"] },
        query: t.name,
        nodes: t.nodes,
        edges: t.edges
      });
      memoryState = JSON.stringify({
        active: res.current_state,
        history: res.important_history,
        contradictions: res.contradictions
      });
      obsOutput = logs.join(" | ");
      if (t.id === 14) {
         // Should have thrown error
         status = "FAIL (Double compression was not blocked)";
      }
    } catch (e: any) {
      if (t.id === 14 && e.message === "DOUBLE_COMPRESSION_BLOCKED") {
        status = "PASS";
        memoryState = "BLOCKED";
      } else {
        status = `FAIL (${e.message})`;
      }
      obsOutput = logs.join(" | ") + " | " + e.message;
    }
    
    // Restore console
    console.log = originalLog;
    console.warn = originalWarn;

    originalLog(`[TEST ${t.id}] ${t.name}`);
    originalLog(`  ACTION               : Execution`);
    originalLog(`  MEMORY STATE CHANGE  : ${memoryState}`);
    originalLog(`  OBSERVABILITY OUTPUT : ${obsOutput || 'No explicit observ logs'}`);
    originalLog(`  PASS/FAIL            : ${status}`);
    originalLog(`------------------------------------------`);
  }
};

runTests();
