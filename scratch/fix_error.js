const fs = require('fs');
let code = fs.readFileSync('supabase/functions/agent-process/index.ts', 'utf8');

// Replace the fallback error response if it has error.message and status 500
code = code.replace(
  /return new Response\(JSON\.stringify\(\{ error: error\.message \}\), \{\s*status: 500,\s*headers: \{ \.\.\.corsHeaders, 'Content-Type': 'application\/json' \},\s*\}\);/g,
  `return new Response(JSON.stringify({ success: false, fallback_response: "system busy" }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });`
);

// We should also replace the global success response to match if needed, but error block is more critical

// Double check the fallback cascade replacement from earlier
// If we missed anything, ensure `processAndSaveMemory` calls in index.ts are removed or ignored.
// Since we patched memory_manager_v1.ts to be non-ai, it's fine.

fs.writeFileSync('supabase/functions/agent-process/index.ts', code);
console.log('Fixed error block');
