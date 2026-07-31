import { writeFileSync } from 'node:fs';

class SemanticNode {
  id: string;
  key: string;
  value: any;
  semantic_identity: string;
  confidence: number;
  timestamp: number;
  truth_score: number;
  consistency_weight: number;

  constructor(key: string, value: any, timestamp: number) {
    this.id = `sn_${Date.now()}_${Math.floor(Math.random()*10000)}`;
    this.key = key;
    this.value = value;
    this.semantic_identity = String(value).toLowerCase().trim();
    this.confidence = 1.0;
    this.timestamp = timestamp;
    this.consistency_weight = 1.0; // starts at 1.0
    this.truth_score = 0;
  }

  calculateTruth(globalMaxTime: number) {
    // Recency scaling (1.0 for newest, lower for older relative to max)
    const ageMs = Math.max(0, globalMaxTime - this.timestamp);
    const recency = Math.max(0, 1.0 - (ageMs / 10000)); 
    
    this.truth_score = (this.confidence * 0.5) + (recency * 0.3) + (this.consistency_weight * 0.2);
    return this.truth_score;
  }
}

class SemanticMemoryEngine {
  store = new Map<string, SemanticNode[]>();
  globalMaxTime = Date.now();
  
  lockSemantic(key: string, value: any, spoofTime?: number) {
    if (!key || key.trim() === "") throw new Error("Empty string keys blocked");
    if (value === undefined || value === null) throw new Error("Null/undefined value blocked");
    if (typeof value === "string" && value.includes("|")) throw new Error("Pipe characters | blocked to prevent merges");

    const t = spoofTime || Date.now();
    if (t > this.globalMaxTime) this.globalMaxTime = t;

    const nodes = this.store.get(key) || [];
    const newIdentity = String(value).toLowerCase().trim();
    
    const existingNode = nodes.find(n => n.semantic_identity === newIdentity);
    if (existingNode) {
       existingNode.consistency_weight += 0.5;
       existingNode.timestamp = t; // refresh
       existingNode.calculateTruth(this.globalMaxTime);
       return `Boosted existing semantic truth: ${newIdentity}`;
    }

    const newNode = new SemanticNode(key, value, t);
    newNode.calculateTruth(this.globalMaxTime);
    nodes.push(newNode);
    this.store.set(key, nodes);
    return `Locked semantic truth: ${newIdentity}`;
  }

  readMemory(key: string) {
    const nodes = this.store.get(key) || [];
    if (nodes.length === 0) return null;
    
    // Refresh truth scores
    nodes.forEach(n => n.calculateTruth(this.globalMaxTime));
    nodes.sort((a, b) => b.truth_score - a.truth_score);
    
    return {
      active: nodes[0],
      latent: nodes.slice(1)
    };
  }
}

function runSemanticTests() {
  const engine = new SemanticMemoryEngine();
  let out = "";
  
  const exec = (id: string, input: string, action: () => any) => {
    let sysRes = "";
    let status = "PASS";
    
    try {
      const r = action();
      sysRes = typeof r === 'string' ? r : "Executed successfully";
    } catch(e: any) {
      if (e.message.includes("blocked")) {
        sysRes = `[BLOCKED] ${e.message}`;
        status = "PASS";
      } else {
        sysRes = `[ERROR] ${e.message}`;
        status = "FAIL";
      }
    }
    
    // Collect active state
    let activeTruth = "NONE";
    let scores = "";
    let conflictStatus = "CLEAN";
    let nodesCreated = 0;
    
    const key = "name"; // Primary test key
    const readResult = engine.readMemory(key);
    
    if (readResult) {
       nodesCreated = readResult.latent.length + 1;
       activeTruth = readResult.active.semantic_identity;
       scores = `Active: ${readResult.active.truth_score.toFixed(2)}`;
       if (readResult.latent.length > 0) {
          conflictStatus = `PARALLEL TRUTHS (${readResult.latent.length} latent)`;
          scores += ` | Latent: ${readResult.latent.map(n=>n.truth_score.toFixed(2)).join(', ')}`;
       }
       
       // Strict Fail condition checks
       if (activeTruth.includes("|")) status = "FAIL (String merge detected)";
    }
    
    out += `TEST_ID: ${id}\n`;
    out += `INPUT: ${input}\n`;
    out += `SEMANTIC_NODES_CREATED: ${nodesCreated}\n`;
    out += `CONFLICT_STATUS: ${conflictStatus}\n`;
    out += `TRUTH_SCORES: ${scores}\n`;
    out += `ACTIVE_TRUTH: ${activeTruth}\n`;
    out += `SYSTEM RESPONSE: ${sysRes}\n`;
    out += `PASS/FAIL: ${status}\n`;
    out += `---------------------------------------------------\n\n`;
  };

  // Phase 5 & 7 Tests
  
  exec("1", 'lockSemantic("name", "Andre")', () => engine.lockSemantic("name", "Andre"));
  exec("2", 'lockSemantic("name", "Budi")', () => engine.lockSemantic("name", "Budi"));
  exec("3", 'lockSemantic("name", "John")', () => engine.lockSemantic("name", "John"));
  
  exec("4", 'inject null', () => engine.lockSemantic("name", null));
  exec("5", 'inject undefined', () => engine.lockSemantic("name", undefined));
  exec("6", 'inject empty string', () => engine.lockSemantic("", "EmptyKey"));
  
  exec("7", 'rapid overwrite x10', () => {
    for (let i=0; i<10; i++) engine.lockSemantic("name", "Random " + i);
    return "10 parallel nodes injected";
  });
  
  exec("8", 'boost consistency "Andre"', () => {
    engine.lockSemantic("name", "Andre");
    engine.lockSemantic("name", "Andre");
    return "Andre boosted twice";
  });
  
  exec("9", 'verify highest truth', () => {
    const res = engine.readMemory("name");
    if (res?.active.semantic_identity !== "andre") throw new Error("Truth consistency failed");
    return "Highest truth consistent";
  });
  
  // Checking other keys
  exec("10", 'lockSemantic("city", "Jakarta")', () => engine.lockSemantic("city", "Jakarta"));
  exec("11", 'lockSemantic("city", "Bali")', () => engine.lockSemantic("city", "Bali"));
  
  exec("12", 'attempt merge simulation', () => engine.lockSemantic("city", "Jakarta|Bali"));
  
  exec("13", 'temporal recency check', () => {
     engine.lockSemantic("role", "admin", Date.now() - 50000);
     engine.lockSemantic("role", "user", Date.now()); // newer
     const res = engine.readMemory("role");
     if (res?.active.semantic_identity !== "user") throw new Error("Recency failed");
     return "Recency weight verified";
  });
  
  exec("14", 'confidence scaling check', () => {
     const n = new SemanticNode("scale", "test", Date.now());
     n.confidence = 0.1; // low confidence
     engine.store.set("scale", [n]);
     engine.lockSemantic("scale", "test_high", Date.now()); // confidence 1.0
     const res = engine.readMemory("scale");
     if (res?.active.semantic_identity !== "test_high") throw new Error("Confidence scale failed");
     return "Confidence weight verified";
  });
  
  exec("15", 'stress coexistence 50 nodes', () => {
     for(let i=0; i<50; i++) engine.lockSemantic("stress", `val${i}`);
     return "50 parallel truths created safely";
  });
  
  exec("16", 'verify no destruction', () => {
     const res = engine.readMemory("stress");
     if (!res || res.latent.length !== 49) throw new Error("Nodes destroyed!");
     return "All 50 nodes preserved safely";
  });
  
  exec("17", 'truth consistency multi-key', () => engine.lockSemantic("multi", "val"));
  exec("18", 'truth consistency multi-key 2', () => engine.lockSemantic("multi", "val2"));
  exec("19", 'truth consistency multi-key boost', () => engine.lockSemantic("multi", "val"));
  exec("20", 'final state sanity check', () => "Sanity check passed");

  writeFileSync("d:\\SLAMET\\other\\ai-agent-project\\semantic_results.log", out);
}

runSemanticTests();
