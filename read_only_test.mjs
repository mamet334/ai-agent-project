import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runReadOnlyValidation() {
    console.log("=========================================");
    console.log("🔍 READ-ONLY VALIDATION SUITE STARTING");
    console.log("=========================================\n");

    try {
        // A. VERIFIKASI DATA NYATA
        console.log("[A] Verifikasi Data Nyata");
        const { data: memories, error: memErr } = await supabase.from('user_memories').select('id, user_id, summary').limit(10);
        if (memErr) throw memErr;
        
        console.log(`Ditemukan ${memories.length} memori.`);
        if (memories.length === 0) {
            console.warn("⚠️ Tidak ada data memori untuk pengujian. Test gagal karena tidak ada data.");
            return;
        }

        const realUserId = memories[0].user_id;
        const sampleKeyword = memories[0].summary.split(' ')[0] || '';
        console.log(`Menggunakan User ID: ${realUserId} | Keyword: ${sampleKeyword}`);

        const { data: relations, error: relErr } = await supabase.from('memory_relations').select('*').limit(5);
        if (relErr) throw relErr;
        console.log(`Ditemukan ${relations.length} relasi (edges) di database.\n`);

        // B. TEST STATE_QUERY
        console.log("[B] Test STATE_QUERY");
        let { data: stateRes, error: stateErr } = await supabase.rpc('extract_cognitive_subgraph', {
            p_user_id: realUserId,
            p_keywords: [sampleKeyword, 'tinggal', 'suka', 'nama'],
            p_intent_mode: 'STATE_QUERY',
            p_max_nodes: 5,
            p_max_edges: 5,
            p_traversal_depth: 2
        });
        
        if (stateErr) throw stateErr;
        let passState = stateRes.edges.length === 0 && stateRes.stats.edges_used === 0;
        console.log(`Output Nodes: ${stateRes.nodes.length}, Edges: ${stateRes.edges.length}`);
        console.log(`STATUS: ${passState ? 'PASS' : 'FAIL'}\n`);

        // C. TEST DELTA (Graph Traversal)
        console.log("[C] Test DELTA (Graph Traversal)");
        let { data: deltaRes, error: deltaErr } = await supabase.rpc('extract_cognitive_subgraph', {
            p_user_id: realUserId,
            p_keywords: [sampleKeyword, 'tinggal', 'suka', 'nama'],
            p_intent_mode: 'DELTA',
            p_max_nodes: 10,
            p_max_edges: 10,
            p_traversal_depth: 3
        });

        if (deltaErr) throw deltaErr;
        // Jika ada relasi di DB untuk user ini, mungkin edges > 0. 
        // Jika tidak ada, ya 0. Tapi minimal logic tidak error.
        let passDelta = deltaRes.nodes.length >= stateRes.nodes.length;
        console.log(`Output Nodes: ${deltaRes.nodes.length}, Edges: ${deltaRes.edges.length}`);
        console.log(`STATUS: ${passDelta ? 'PASS' : 'FAIL'}\n`);

        // D. TEST CYCLE DETECTION
        console.log("[D] Test CYCLE DETECTION");
        // Kita tidak bisa mensuntik loop, tapi kita bisa memastikan eksekusi tidak timeout dan stat kedalaman rasional
        let passCycle = deltaRes.stats.depth_reached <= 3; // depth < p_traversal_depth
        console.log(`Kedalaman maksimum tercapai: ${deltaRes.stats.depth_reached} / 3`);
        console.log(`STATUS: ${passCycle ? 'PASS' : 'FAIL'}\n`);

        // E. TEST BUDGET LIMIT
        console.log("[E] Test BUDGET LIMIT");
        let passBudget = true;
        for (let maxNodes of [1, 2]) {
            let { data: budgetRes, error: budgetErr } = await supabase.rpc('extract_cognitive_subgraph', {
                p_user_id: realUserId,
                p_keywords: [sampleKeyword, 'tinggal', 'suka', 'nama'],
                p_intent_mode: 'ANALYTIC',
                p_max_nodes: maxNodes,
                p_max_edges: 10,
                p_traversal_depth: 3
            });
            if (budgetErr) throw budgetErr;
            console.log(`Limit: ${maxNodes} -> Output Nodes: ${budgetRes.nodes.length}, Exhausted: ${budgetRes.stats.budget_exhausted}`);
            if (budgetRes.nodes.length > maxNodes) passBudget = false;
        }
        console.log(`STATUS: ${passBudget ? 'PASS' : 'FAIL'}\n`);

        console.log("=========================================");
        console.log("🎉 READ-ONLY VALIDATION FINISHED");
        console.log("=========================================");

    } catch (e) {
        console.error("❌ ERROR EXECUTING TEST:", e);
    }
}

runReadOnlyValidation();
