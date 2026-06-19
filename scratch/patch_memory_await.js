const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');
let code = fs.readFileSync(filePath, 'utf8');

// The code currently has my previous logs injected into the first instance.
// Let's use regex to catch all 3 instances.
// We want to replace everything from `const memoryPromiseX = ...` up to the end of the `if (typeof EdgeRuntime...)` block.

// 1. First instance (has logs)
const target1 = /console\.log\('\[AGENT_PROCESS\] Memanggil processAndSaveMemory secara fire-and-forget\.\.\.'\);\s*const memoryPromise1 = processAndSaveMemory\((.*?)\)\.catch\(.*?\);\s*console\.log\('\[AGENT_PROCESS\] Pemanggilan processAndSaveMemory dilepas \(promise belum selesai\)\.'\);\s*\/\/\s*@ts-ignore\s*if\s*\(typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime\.waitUntil === 'function'\)\s*\{\s*\/\/\s*@ts-ignore\s*EdgeRuntime\.waitUntil\(memoryPromise1\);\s*\}/s;

// Wait, the user might have reset the file, or maybe my previous patch is still there. Let's just use a more robust regex that catches the original and the patched versions.

const patch1 = code.replace(/(\/\/ Kita hanya mengambil 'message' murni[\s\S]*?)const memoryPromise1[\s\S]*?EdgeRuntime\.waitUntil\(memoryPromise1\);\s*\}/, `$1// KINI DIAWAIT KARENA DENO MEMBUNUH BACKGROUND PROMISE SAAT STREAMING SELESAI
        await processAndSaveMemory(message, "[Chat Biasa - AI Respons Streamed]", userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', GEMINI_API_KEY, GROQ_API_KEY).catch(e => console.error(e));`);

const patch2 = patch1.replace(/const memoryPromise2 = processAndSaveMemory\((.*?)\)\.catch\(.*?\);\s*\/\/\s*@ts-ignore\s*if\s*\(typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime\.waitUntil === 'function'\)\s*\{\s*\/\/\s*@ts-ignore\s*EdgeRuntime\.waitUntil\(memoryPromise2\);\s*\}/s, `await processAndSaveMemory($1).catch(e => console.error(e));`);

const patch3 = patch2.replace(/const memoryPromise3 = processAndSaveMemory\((.*?)\)\.catch\(.*?\);\s*\/\/\s*@ts-ignore\s*if\s*\(typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime\.waitUntil === 'function'\)\s*\{\s*\/\/\s*@ts-ignore\s*EdgeRuntime\.waitUntil\(memoryPromise3\);\s*\}/s, `await processAndSaveMemory($1).catch(e => console.error(e));`);

fs.writeFileSync(filePath, patch3);
console.log('Backend memory promise replaced with AWAIT successfully!');
