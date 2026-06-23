import { detectFact } from '../supabase/functions/agent-process/lib/fact_detector.ts';

console.log("━━━━━━━━━━━━━━━━━━━━━━━");
console.log("PHASE A: MEMORY TYPE CLASSIFICATION TEST");
console.log("━━━━━━━━━━━━━━━━━━━━━━━");

const testCases = [
  "Namaku adalah Slamet Riyadi",
  "Saya tinggal di jakarta selatan",
  "aku kerja di perusahaan startup AI",
  "saya sangat suka minum susu soda",
  "aku lagi membangun proyek robotika",
  "istriku namanya siti",
  "fakta: binance adalah crypto nomor satu",
  "kemarin aku pergi ke pasar"
];

testCases.forEach(input => {
    const result = detectFact(input);
    console.log(`Input : "${input}"`);
    console.log(`Intent: ${result.intent}`);
    console.log(`Type  : ${result.memory_type}`);
    console.log(`Score : ${result.score}`);
    console.log("-----------------------");
});
