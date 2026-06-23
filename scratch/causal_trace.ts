import { detectFact } from '../supabase/functions/agent-process/lib/fact_detector.ts';
import TokenSaverAgent from '../frontend/src/lib/tokenSaverAgent.js';

const crypto = globalThis.crypto;

const inputs = [
  "saya juga suka susu",
  "saya suka kopi hitam",
  "aku juga kerja di startup AI",
  "nama saya Budi Santoso"
];

const agent = new TokenSaverAgent();

console.log("=== CAUSAL TRACE START ===");

for (const input of inputs) {
  const traceId = crypto.randomUUID();
  console.log(`\nTRACE ID:\n${traceId}`);
  console.log("LAYER BREAKDOWN:");
  
  console.log(`\nA. RAW INPUT:\n${input}`);
  
  const tokenSaverOutput = agent.optimizePrompt(input);
  console.log(`\nB. TOKEN SAVER OUTPUT:\n${tokenSaverOutput}`);
  
  console.log(`\nC. FACT DETECTOR INPUT:\n${tokenSaverOutput}`);
  
  const factResult = detectFact(tokenSaverOutput);
  console.log(`\nD. FACT DETECTOR OUTPUT:\n${JSON.stringify(factResult)}`);
  
  const baseTruth = detectFact(input);
  
  const semanticChange = (factResult.intent !== baseTruth.intent) || (factResult.shouldSaveMemory !== baseTruth.shouldSaveMemory) ? "YES" : "NO";
  const truncation = (tokenSaverOutput.length < input.length) ? "YES" : "NO";
  const meaningLoss = semanticChange === "YES" ? "YES" : "NO";
  
  console.log(`\nDELTA ANALYSIS:\n- semantic change: ${semanticChange}\n- truncation: ${truncation}\n- meaning loss: ${meaningLoss}`);
}
console.log("\n=== CAUSAL TRACE END ===");
