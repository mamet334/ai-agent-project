import TokenSaverAgent from '../frontend/src/lib/tokenSaverAgent.js';

const agent = new TokenSaverAgent();

const inputs = [
  "saya juga suka susu",
  "saya suka kopi hitam",
  "aku juga kerja di startup AI",
  "nama saya Budi Santoso"
];

console.log("--- START TRACE ---");
for (const input of inputs) {
  console.log(`RAW INPUT: ${input}`);
  const optimized = agent.optimizePrompt(input);
  console.log(`AFTER TOKEN SAVER: ${optimized}`);
  console.log("---");
}
