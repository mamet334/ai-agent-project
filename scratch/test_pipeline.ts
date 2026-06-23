import { detectFact } from '../supabase/functions/agent-process/lib/fact_detector.ts';

console.log("===================================");
console.log("TASK 1: NORMALIZATION PIPELINE TRACE");
console.log("===================================");

const input = "Saya adalah Slamet";
let lowerText = input.trim().toLowerCase();
console.log("rawText        :", input);
console.log("lowerText      :", lowerText);
lowerText = lowerText.replace(/\b(gue|aku|saya|namaku)\b/g, 'SELF');
lowerText = lowerText.replace(/\s+/g, ' ').trim();
console.log("normalizedText :", lowerText);
console.log("Exact string used by classifier:", lowerText);
console.log("SELF Evaluation: ", lowerText.includes('SELF') ? 'YES' : 'NO');

console.log("\n===================================");
console.log("TASK 2: COLLISION TESTS");
console.log("===================================");

const testCases = [
  "Saya makan siang tadi",
  "Saya minum air putih",
  "Saya suka minum kopi",
  "Saya suka makan bakso",
  "Saya benci durian"
];

testCases.forEach(text => {
    const result = detectFact(text);
    console.log(`Input       : "${text}"`);
    console.log(`Intent      : ${result.intent}`);
    console.log(`Memory_type : ${result.memory_type}`);
    console.log(`Score       : ${result.score}`);
    console.log("-----------------------------------");
});
