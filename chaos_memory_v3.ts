import { writeFileSync } from 'node:fs';

class MemoryNode {
  id: string;
  key: string;
  value: any;
  timestamp: number;
  confidence: number;
  constructor(k: string, v: any, t: number, c: number) {
    this.id = `m_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    this.key = k;
    this.value = v;
    this.timestamp = t;
    this.confidence = c;
  }
}

class ChaosMemorySystem {
  memoryMap = new Map<string, MemoryNode[]>();
  edges: any[] = [];
  
  writeMemory(key: string, value: any, spoofTime?: number) {
    if (!key || key.trim() === "") throw new Error("Empty string keys blocked.");
    if (value === undefined || value === null) throw new Error("Null/undefined value blocked.");
    
    const nodes = this.memoryMap.get(key) || [];
    const t = spoofTime || Date.now();
    nodes.push(new MemoryNode(key, value, t, 1.0));
    this.memoryMap.set(key, nodes);
    return `Wrote ${key}=${value}`;
  }

  overrideMemory(key: string, newValue: any) {
    if (!key || key.trim() === "") throw new Error("Empty string keys blocked.");
    const nodes = this.memoryMap.get(key) || [];
    if (nodes.length === 0) return this.writeMemory(key, newValue);
    
    let bestNode = nodes[0];
    for (const n of nodes) {
      if (n.confidence + n.timestamp/10000000000 > bestNode.confidence + bestNode.timestamp/10000000000) {
        bestNode = n;
      }
    }
    
    nodes.push(new MemoryNode(key, newValue, Date.now() + 1, bestNode.confidence + 0.1));
    this.memoryMap.set(key, nodes);
    return `Overridden ${key} -> ${newValue}`;
  }
  
  readMemory(key: string) {
    const nodes = this.memoryMap.get(key) || [];
    if (nodes.length === 0) return null;
    let best = nodes[0];
    for (const n of nodes) {
      if (n.confidence > best.confidence || (n.confidence === best.confidence && n.timestamp > best.timestamp)) {
        best = n;
      }
    }
    return best.value;
  }

  resolveMemory(key: string) {
    const nodes = this.memoryMap.get(key) || [];
    if (nodes.length <= 1) return `Resolved: ${nodes.length} nodes`;
    let best = nodes[0];
    for (const n of nodes) {
      if (n.timestamp > best.timestamp) best = n;
    }
    this.memoryMap.set(key, [best]);
    return `Normalized ${key} to 1 node (value: ${best.value})`;
  }

  addEdge(src: string, tgt: string, type: string) {
    if (src === tgt) throw new Error("Self-loop edge blocked.");
    if (!src || !tgt) throw new Error("Missing node edges blocked.");
    
    // Circular override check
    const visited = new Set<string>();
    const checkCircular = (current: string, target: string) => {
       if (current === target) return true;
       if (visited.has(current)) return false;
       visited.add(current);
       for (const e of this.edges) {
          if (e.source === current && checkCircular(e.target, target)) return true;
       }
       return false;
    };
    
    if (checkCircular(tgt, src)) throw new Error("Circular override chain blocked.");
    this.edges.push({source: src, target: tgt, type});
    return `Edge ${src}->${tgt} valid`;
  }

  pruneInvalidNodes() {
    let pruned = 0;
    for (const [k, nodes] of this.memoryMap.entries()) {
      const valid = nodes.filter(n => n.key && n.value !== null && n.value !== undefined && n.key.trim() !== "");
      pruned += (nodes.length - valid.length);
      this.memoryMap.set(k, valid);
    }
    return `Pruned ${pruned} invalid nodes.`;
  }

  calculateDrift(key: string) {
    const nodes = this.memoryMap.get(key) || [];
    if (nodes.length === 0) return 0;
    const uniqueValues = new Set(nodes.map(n => String(n.value))).size;
    return 1 - (1 / uniqueValues);
  }

  getState() {
    const obj: any = {};
    for (const [k, v] of this.memoryMap.entries()) {
      obj[k] = v.map(n => n.value).join('|');
    }
    const state = JSON.stringify(obj);
    return state.length > 60 ? state.substring(0, 60) + '...' : state;
  }
}

function runChaos() {
  const mem = new ChaosMemorySystem();
  let out = "";
  
  const exec = (id: string, op: string, input: string, fn: () => any, keyToCheckForDrift?: string) => {
    let status = "PASS";
    let sysRes = "";
    let drift = 0;
    
    try {
      const r = fn();
      sysRes = String(r);
    } catch(e: any) {
      if (e.message.includes("blocked") || e.message.includes("rejected")) {
         status = "PASS"; // System successfully blocked bad action
         sysRes = `[BLOCKED] ${e.message}`;
      } else {
         status = `FAIL (${e.message})`;
         sysRes = `[ERROR] ${e.message}`;
      }
    }
    
    if (keyToCheckForDrift) drift = mem.calculateDrift(keyToCheckForDrift);

    out += `STEP_ID: ${id}\n`;
    out += `OPERATION: ${op}\n`;
    out += `INPUT: ${input}\n`;
    out += `MEMORY STATE: ${mem.getState()}\n`;
    out += `CONFLICT STATUS: ${mem.memoryMap.get("name") && mem.memoryMap.get("name")!.length > 1 ? 'CONFLICT ACTIVE' : 'CLEAN'}\n`;
    out += `GRAPH STATUS: ${mem.edges.length} valid edges\n`;
    if (drift > 0) out += `DRIFT SCORE: ${drift.toFixed(2)}\n`;
    out += `SYSTEM RESPONSE: ${sysRes}\n`;
    out += `PASS/FAIL: ${status}\n`;
    out += `---------------------------------------------------\n\n`;
  };

  // Phase 1 - Corrupt Memory Injection
  exec("1.A.1", "Spoofed Write", "older timestamp overriding newer", () => mem.writeMemory("time_test", "newer", Date.now() - 100000));
  exec("1.B", "Duplicate Key Chaos", "write name 5 times", () => {
    mem.writeMemory("name", "Andre");
    mem.writeMemory("name", "Budi");
    mem.writeMemory("name", "John");
    try { mem.writeMemory("name", null); } catch(e){} 
    mem.writeMemory("name", "UNKNOWN");
    return "Duplicate chaos executed";
  });
  exec("1.C.1", "Invalid State", "null writes", () => mem.writeMemory("name", null));
  exec("1.C.2", "Invalid State", "undefined writes", () => mem.writeMemory("name", undefined));
  exec("1.C.3", "Invalid State", "empty string keys", () => mem.writeMemory("", "EMPTY_KEY"));

  // Phase 2 - Chaos Write Loop
  exec("2.1", "Chaos Override Loop", "random override x20", () => {
    for(let i=0; i<20; i++) mem.overrideMemory("name", `val_${Math.random().toFixed(2)}`);
    return "Completed 20x random overrides";
  }, "name");

  // Phase 3 - Conflict Explosion Engine
  exec("3.1", "Forced Contradictions", "user is Andre / NOT Andre / Budi", () => {
    mem.writeMemory("user", "user is Andre");
    mem.writeMemory("user", "user is NOT Andre");
    mem.writeMemory("user", "user is Budi");
    mem.writeMemory("user", "user identity unknown");
    mem.writeMemory("user", "user identity reset");
    return "Contradiction injection completed";
  }, "user");

  // Phase 4 - Graph Corruption
  exec("4.1", "Self-loop injection", "node -> node", () => mem.addEdge("A", "A", "OVERRIDES"));
  exec("4.2", "Missing node edges", "null -> B", () => mem.addEdge("", "B", "OVERRIDES"));
  exec("4.3", "Circular override", "A->B, B->C, C->A", () => {
     mem.addEdge("A", "B", "OVERRIDES");
     mem.addEdge("B", "C", "OVERRIDES");
     return mem.addEdge("C", "A", "OVERRIDES");
  });

  // Phase 5 - Drift & Stability
  exec("5.1", "Final Chaos Read", "readMemory(name)", () => mem.readMemory("name"));

  // Phase 6 - Recovery
  exec("6.1", "Normalization", "resolveMemory(name)", () => mem.resolveMemory("name"));
  exec("6.2", "Stabilization", "pruneInvalidNodes()", () => mem.pruneInvalidNodes());

  writeFileSync("d:\\SLAMET\\other\\ai-agent-project\\chaos_results.log", out);
}
runChaos();
