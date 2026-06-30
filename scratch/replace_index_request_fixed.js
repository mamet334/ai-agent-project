const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');

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

const lines = [];
lines.push("serve(async (req) => {");
lines.push("  if (req.method === 'GET') {");
lines.push("    const runtimeEnv = {");
lines.push("      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',");
lines.push("      supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',");
lines.push("      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',");
lines.push("      apifyApiToken: Deno.env.get('APIFY_API_TOKEN') || '',");
lines.push("      enableAsyncMemoryWrite: Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false'");
lines.push("    };");
lines.push("    try {");
lines.push("      const supClient = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey);");
lines.push("      const { data: logsData, error: logsError } = await supClient.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(50);");
lines.push("      const { data: memData, error: memError } = await supClient.from('user_memories').select('*').order('created_at', { ascending: false }).limit(50);");
lines.push("      return new Response(JSON.stringify({ logs: logsData, logsError, memories: memData, memError }), {");
lines.push("        headers: { ...corsHeaders, 'Content-Type': 'application/json' }");
lines.push("      });");
lines.push("    } catch (e: any) {");
lines.push("      return new Response(JSON.stringify({ error: e.message }), {");
lines.push("        headers: { ...corsHeaders, 'Content-Type': 'application/json' },");
lines.push("        status: 500");
lines.push("      });");
lines.push("    }");
lines.push("  }");
lines.push("");
lines.push("  const pipelineResult = await executeRequestPipeline({ request: req, corsHeaders });");
lines.push("  if (pipelineResult.response) return pipelineResult.response;");
lines.push("");
lines.push("  const { ctx, rctx } = pipelineResult;");
lines.push("  let routingDecision = ctx.request.routingDecision;");
lines.push("  const globalMemory = ctx.request.globalMemory;");
lines.push("  const tools = ctx.request.tools;");
lines.push("  const history = ctx.request.history;");
lines.push("  const stream = ctx.request.stream;");
lines.push("  const extractedImage = ctx.request.extractedImage;");
lines.push("  const auditMode = ctx.request.auditMode;");
lines.push("  const contractValidation = ctx.request.contractValidation;");
lines.push("  const desktopOSMode = ctx.request.desktopOSMode;");
lines.push("  const agentIdentityPrompt = ctx.request.agentIdentityPrompt || '';");
lines.push("  const userContextPrompt = ctx.request.userContextPrompt || '';");
lines.push("  const isRagEnabled = ctx.request.isRagEnabled;");
lines.push("  const effectiveRagThreshold = ctx.request.effectiveRagThreshold;");
lines.push("  const effectiveRagMatchCount = ctx.request.effectiveRagMatchCount;");
lines.push("  let replyMessage = 'Gagal memproses jawaban dari AI.';");
lines.push("  let groundingSources: any[] = [];");
lines.push("  let toolExecution: any = null;");
lines.push("  let subagentRuns: any[] = [];");
lines.push("");
lines.push("");

const replacement = lines.join("\\n");

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(file, newContent);

let finalContent = fs.readFileSync(file, 'utf8');
if (!finalContent.includes("executeRequestPipeline")) {
  finalContent = "import { executeRequestPipeline } from './lib/request/request_pipeline.ts';\\n" + finalContent;
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
