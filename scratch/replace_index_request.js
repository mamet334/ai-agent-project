const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');

// The file is currently corrupted with literal "\\n" strings! Let's restore from git first.
const { execSync } = require('child_process');
try {
  execSync('git checkout supabase/functions/agent-process/index.ts');
  console.log("Restored index.ts from git");
} catch (e) {
  console.log("Git checkout failed");
}

content = fs.readFileSync(file, 'utf8');

const startStr = "serve(async (req) => {";
const endStr = "    // --- RAG PIPELINE (FACADE) ---";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end strings");
  process.exit(1);
}

const replacement = \`serve(async (req) => {
  if (req.method === 'GET') {
    const runtimeEnv = {
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
      apifyApiToken: Deno.env.get('APIFY_API_TOKEN') || '',
      enableAsyncMemoryWrite: Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false'
    };
    try {
      const supClient = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey);
      const { data: logsData, error: logsError } = await supClient.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(50);
      const { data: memData, error: memError } = await supClient.from('user_memories').select('*').order('created_at', { ascending: false }).limit(50);
      return new Response(JSON.stringify({ logs: logsData, logsError, memories: memData, memError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }

  const pipelineResult = await executeRequestPipeline({ request: req, corsHeaders });
  if (pipelineResult.response) return pipelineResult.response;

  const { ctx, rctx } = pipelineResult;
  let routingDecision = ctx.request.routingDecision;
  const globalMemory = ctx.request.globalMemory;
  const tools = ctx.request.tools;
  const history = ctx.request.history;
  const stream = ctx.request.stream;
  const extractedImage = ctx.request.extractedImage;
  const auditMode = ctx.request.auditMode;
  const contractValidation = ctx.request.contractValidation;
  const desktopOSMode = ctx.request.desktopOSMode;
  const agentIdentityPrompt = ctx.request.agentIdentityPrompt || '';
  const userContextPrompt = ctx.request.userContextPrompt || '';
  const isRagEnabled = ctx.request.isRagEnabled;
  const effectiveRagThreshold = ctx.request.effectiveRagThreshold;
  const effectiveRagMatchCount = ctx.request.effectiveRagMatchCount;
  let replyMessage = 'Gagal memproses jawaban dari AI.';
  let groundingSources: any[] = [];
  let toolExecution: any = null;
  let subagentRuns: any[] = [];

\`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(file, newContent);

let finalContent = fs.readFileSync(file, 'utf8');
if (!finalContent.includes("executeRequestPipeline")) {
  finalContent = "import { executeRequestPipeline } from './lib/request/request_pipeline.ts';\n" + finalContent;
}

finalContent = finalContent.replace("import { Buffer } from 'node:buffer';\\n", "");
finalContent = finalContent.replace("import { WorkspaceGuardian } from './lib/workspace_guardian.ts';\\n", "");
finalContent = finalContent.replace("  geminiKeyIndex, setGeminiKeyIndex,\\n", "");
finalContent = finalContent.replace("  groqKeyIndex, setGroqKeyIndex,\\n", "");
finalContent = finalContent.replace("  openaiKeyIndex, setOpenaiKeyIndex,\\n", "");
finalContent = finalContent.replace("  openrouterKeyIndex, setOpenrouterKeyIndex,\\n", "");
finalContent = finalContent.replace("  clearAllCooldowns, runLLM, runCoordinatorLLM\\n", "  runLLM, runCoordinatorLLM\\n");
finalContent = finalContent.replace("import { Buffer } from 'node:buffer';\\r\\n", "");
finalContent = finalContent.replace("import { WorkspaceGuardian } from './lib/workspace_guardian.ts';\\r\\n", "");
finalContent = finalContent.replace("  geminiKeyIndex, setGeminiKeyIndex,\\r\\n", "");
finalContent = finalContent.replace("  groqKeyIndex, setGroqKeyIndex,\\r\\n", "");
finalContent = finalContent.replace("  openaiKeyIndex, setOpenaiKeyIndex,\\r\\n", "");
finalContent = finalContent.replace("  openrouterKeyIndex, setOpenrouterKeyIndex,\\r\\n", "");
finalContent = finalContent.replace("  clearAllCooldowns, runLLM, runCoordinatorLLM\\r\\n", "  runLLM, runCoordinatorLLM\\r\\n");


fs.writeFileSync(file, finalContent);
console.log("index.ts replaced.");
