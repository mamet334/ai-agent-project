const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');
let code = fs.readFileSync(filePath, 'utf8');

// There are three calls to processAndSaveMemory.
// 1. Line 1083 (inside `if (isChatBiasa)`)
// 2. Line 1223 (inside `if (plan && plan.length > 0)`)
// 3. Line 1240 (inside `} else {` of the `if (tools || !tools)` which is logically flawed anyway)

// The root cause is the `if (tools || !tools)` condition wrapping everything, which is effectively a `true` block. 
// Within it, there is `isChatBiasa = true`. 
// Because of the nested if/else structure and the way the stream responses might be processed or not processed, 
// the code might be falling through or executing multiple branches.
// Wait, looking at lines 1075-1250:
/*
if (tools || !tools) {
  const isChatBiasa = true; 
  if (isChatBiasa) {
    await processAndSaveMemory(...) // Call 1
    if (stream) return streamRes;
    replyMessage = runLLM();
  } else {
    // subagent logic
    if (plan && plan.length > 0) {
      await processAndSaveMemory(...) // Call 2
      if (stream) return streamRes;
      replyMessage = runLLM();
    } else {
      if (stream) return streamRes;
      replyMessage = runLLM();
    }
  }
} else {
  await processAndSaveMemory(...) // Call 3
}
*/

// If `isChatBiasa = true`, Call 1 executes. If `stream` is false, it proceeds to `runLLM()`.
// Then, the outer `if (tools || !tools)` block finishes. 
// But wait, there is no multiple execution of `processAndSaveMemory` sequentially in that trace. 
// However, the function `processAndSaveMemory` inside `index.ts` is called once per `agent-process` invocation.
// Wait, where is the double execution coming from?
// Is there a double API call from the frontend?

// Actually, in `memory_manager_v1.ts`, `shouldSave = memoryRegex.test(lower)` triggers the DB insert.
// If the frontend sends 2 requests (e.g. React Strict Mode double effect, or one standard and one background), 
// it will cause double execution.

// Wait, let's look at the patch request. The user asked me to give the Root Cause, Evidence, Risk Level, Recommended Patch, Estimated Side Effects. I just need to return the audit report, I don't strictly need to patch it right now unless requested?
// "Berikan: 1. Root cause utama double insert ... 4. Patch fix minimal (kode langsung) 5. Patch fix ideal (arsitektur clean)"
// Yes, I need to provide the report and the code snippet for the patch, but I don't necessarily have to apply it immediately if they just asked me to "Lakukan audit mendalam... Berikan: [output]". Wait, the prompt says "Lakukan audit mendalam... Berikan: 1, 2, 3, 4, 5." It didn't explicitly say "Jangan patch", but usually "Berikan patch fix minimal" means I should output the code in my response.

console.log('done');
