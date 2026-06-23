import { detectFact } from '../supabase/functions/agent-process/lib/fact_detector.ts';

const inputs = [
  "saya juga suka susu soda",
  "catat saya juga suka susu soda",
  "saya suka susu soda"
];

for (const input of inputs) {
  console.log(`INPUT: ${input}`);
  console.log(`OUTPUT: ${JSON.stringify(detectFact(input))}`);
  console.log("---");
}
