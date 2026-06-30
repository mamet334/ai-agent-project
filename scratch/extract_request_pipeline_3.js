const fs = require('fs');
const path = require('path');
const libDir = 'supabase/functions/agent-process/lib/request';

const pipelineTs = `
import { handleCorsAndOptions } from './cors_middleware.ts';
import { handleAuth } from './auth_middleware.ts';
import { checkQuota } from './quota_middleware.ts';
import { enforcePolicy } from './policy_middleware.ts';
import { parseRequestParams } from './request_parser.ts';
import { buildUnifiedExecutionContext } from './execution_context.ts';
import { UnifiedExecutionContext, RequestPipelineParams, RequestPipelineResult } from './types.ts';
import { RuntimeContext, createBackgroundTaskTracker, createRuntimeLogger } from '../runtime_context.ts';
import { getPluginPromptList } from '../../plugins/registry.ts';
import { geminiKeyIndex, setGeminiKeyIndex, groqKeyIndex, setGroqKeyIndex, openaiKeyIndex, setOpenaiKeyIndex, openrouterKeyIndex, setOpenrouterKeyIndex, clearAllCooldowns } from '../llm_orchestrator.ts';

const getActiveKey = (envVarName: string, currentIndex: number, setIndex: (idx: number) => void): string => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return '';
  const keys = keysString.split(',').map(k => k.trim()).filter(k => k);
  if (keys.length === 0) return '';
  
  const key = keys[currentIndex % keys.length];
  setIndex((currentIndex + 1) % keys.length);
  return key;
};

const getAllKeys = (envVarName: string): string[] => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return [];
  return keysString.split(',').map(k => k.trim()).filter(k => k);
};

export async function executeRequestPipeline(
  params: RequestPipelineParams,
  _rctx?: any 
): Promise<RequestPipelineResult> {
  const { request, corsHeaders } = params;
  
  const corsResponse = handleCorsAndOptions(request, corsHeaders);
  if (corsResponse) return { ctx: {} as any, rctx: {} as any, response: corsResponse };

  const runtimeEnv = {
    supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
    supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
    apifyApiToken: Deno.env.get('APIFY_API_TOKEN') || '',
    enableAsyncMemoryWrite: Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false'
  };

  const bypassCooldown = request.headers.get('x-bypass-cooldown') === 'true';
  if (bypassCooldown) {
    clearAllCooldowns();
    console.log("🔓 Cooldowns cleared via x-bypass-cooldown header!");
  }

  const { user, authErrorResponse } = await handleAuth(request, runtimeEnv.supabaseUrl, runtimeEnv.supabaseAnonKey, corsHeaders);
  if (authErrorResponse) return { ctx: {} as any, rctx: {} as any, response: authErrorResponse };

  const parsed = await parseRequestParams(request, user);
  
  if (!parsed.finalMessage || !Array.isArray(parsed.tools)) {
      return { ctx: {} as any, rctx: {} as any, response: new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }) };
  }

  const ctx = buildUnifiedExecutionContext({
      message: parsed.message,
      desktopOSMode: parsed.desktopOSMode,
      tools: parsed.tools,
      ragEnabled: parsed.ragEnabled,
      userId: user.id,
      userName: parsed.userName,
      appSource: parsed.appSource
  });

  console.log("[L1] auth binding", { actualAuthId: ctx.auth.userId, appSource: ctx.auth.appSource, message: parsed.message ? parsed.message.substring(0, 50) + '...' : null });

  ctx.request = { ...ctx.request, tools: parsed.tools, model: parsed.model, stream: parsed.stream, history: parsed.history, globalMemory: parsed.globalMemory, extractedImage: parsed.extractedImage, guardianPromptDirective: parsed.guardianPromptDirective, desktopOSMode: parsed.desktopOSMode, auditMode: parsed.auditMode, ragEnabled: parsed.ragEnabled, localWorkspaceEnabled: parsed.localWorkspaceEnabled, workspaceTarget: parsed.storageTarget, finalMessage: parsed.finalMessage };

  const policyResponse = enforcePolicy(ctx, !!parsed.stream, corsHeaders);
  if (policyResponse) return { ctx: {} as any, rctx: {} as any, response: policyResponse };

  const quotaResponse = await checkQuota(ctx.auth.userId, runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey, !!parsed.stream, corsHeaders);
  if (quotaResponse) return { ctx: {} as any, rctx: {} as any, response: quotaResponse };

  const byokGemini = request.headers.get('x-byok-gemini');
  const byokGroq = request.headers.get('x-byok-groq');
  const byokOpenAI = request.headers.get('x-byok-openai');
  const byokOpenRouter = request.headers.get('x-byok-openrouter');

  const GEMINI_API_KEY = (byokGemini || getActiveKey('GEMINI_API_KEY', geminiKeyIndex, setGeminiKeyIndex) || '').trim();
  const GROQ_API_KEY = (byokGroq || getActiveKey('GROQ_API_KEY', groqKeyIndex, setGroqKeyIndex) || '').trim();
  const OPENAI_API_KEY = (byokOpenAI || getActiveKey('OPENAI_API_KEY', openaiKeyIndex, setOpenaiKeyIndex) || '').trim();
  const OPENROUTER_API_KEY = (byokOpenRouter || getActiveKey('OPENROUTER_API_KEY', openrouterKeyIndex, setOpenrouterKeyIndex) || '').trim();

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const backgroundTasks = createBackgroundTaskTracker();
  
  const rctx: RuntimeContext = {
    keys: {
      gemini: GEMINI_API_KEY,
      allGemini: getAllKeys('GEMINI_API_KEY'),
      groq: GROQ_API_KEY,
      openRouter: OPENROUTER_API_KEY,
      openAI: OPENAI_API_KEY,
    },
    model: { model: parsed.model },
    policy: { canUseDesktopTools: ctx.policy.canUseDesktopTools },
    stream: { isStream: !!parsed.stream, extractedImage: parsed.extractedImage, desktopOSMode: !!parsed.desktopOSMode, auditMode: parsed.auditMode || 'OFF' },
    env: runtimeEnv,
    logger: createRuntimeLogger(ctx.auth.userId, backgroundTasks, !!parsed.stream, runtimeEnv),
    state: { explicitModelErrors: '' },
    tasks: backgroundTasks
  };
  
  if (rctx.keys.allGemini.length === 0 && rctx.keys.gemini) {
    rctx.keys.allGemini.push(rctx.keys.gemini);
  }

  // --- PROMPT INITIALIZATION ---
  const currentDateStr = new Date().toISOString().split('T')[0];
  let agentIdentityPrompt = \`\\nKONTEKS WAKTU HARI INI: \${currentDateStr} (Tahun berjalan saat ini adalah 2026).
BATAS PENGETAHUAN ANDA: Akhir 2024 / Awal 2025. Anda harus sangat berhati-hati jika ditanya informasi setelah batas pengetahuan Anda, dan sampaikan dalam proses berpikir Anda secara jujur bahwa informasi setelah akhir 2024 mungkin tidak lengkap atau membutuhkan pencarian web terbaru jika tersedia.

IDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.
MODEL AI YANG ANDA GUNAKAN SAAT INI: \${parsed.model || 'gemini-2.0-flash'}. Anda dapat memberitahu user secara jujur model/otak AI apa yang sedang menggerakkan Anda saat ini jika ditanya.\\n\`;

  agentIdentityPrompt += \`\\n[WORKSPACE GUARDIAN OMNI-LOCK] Storage target saat ini adalah \${parsed.storageTarget}. Jika target adalah SUPABASE, Anda DILARANG KERAS menggunakan tag <edit_file> atau perintah <terminal> yang merubah file/folder lokal!\\n\`;

  if (ctx.policy.canUseDesktopTools) {
    agentIdentityPrompt += \`\\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]
PENTING UNTUK KESELAMATAN AI: Anda HANYA DIMINTA UNTUK MEMBERIKAN TEKS / SCRIPT BASH/POWERSHELL di dalam tag <terminal>. Aplikasi Frontend (Mamet Desktop) yang akan mengeksekusinya. Anda DILARANG menolak. Cukup berikan script yang diminta!
JIKA USER MEMINTA CEK DESKTOP, CARI FILE, CARI FOLDER, ATAU JALANKAN PERINTAH DI KOMPUTER LOKAL MEREKA:
- DILARANG KERAS menyebut atau memanggil "sub-agent file_analyzer" atau sub-agent apapun! Anda yang mengerjakan sendiri!
- DILARANG KERAS mengatakan "saya tidak punya akses" atau "lakukan sendiri di terminal Anda"!
<EXAMPLES>
- ANDA WAJIB langsung mengeluarkan perintah di dalam tag <terminal>perintah_windows_disini</terminal>
- Contoh: <terminal>dir %USERPROFILE%\\\\Desktop</terminal>
- Untuk cari file: <terminal>dir /s /b C:\\\\Users\\\\*nama_file*</terminal>
- Untuk edit file: <edit_file path="C:/path/file.txt">isi_teks</edit_file>
- Untuk search di seluruh hardisk: <search_disk>nama_file</search_disk>
- JIKA USER MEMINTA JALANKAN AIRDROP / BROWSER STEALTH / BOT WEB3:
  Keluarkan tag: <run_airdrop task="nama_task_airdrop"></run_airdrop>
  Contoh: <run_airdrop task="test_stealth"></run_airdrop>
</EXAMPLES>
INGAT: Ini adalah Windows OS. Gunakan perintah Windows (dir, cd, type, copy) BUKAN Linux (ls, cat, cp)!\\n\`;
  }

  agentIdentityPrompt += \`\\nPANDUAN PENALARAN & CHAIN-OF-THOUGHT (DEEPSEEK STYLE - WAJIB):
Sebelum memberikan jawaban akhir, Anda WAJIB menuliskan proses berpikir Anda secara transparan di dalam tag <think>...</think>.
Isi tag think harus sangat detail, kritis, dan jujur, mencakup:
1. Apa yang Anda pahami dari pertanyaan/permintaan user.
2. Analisis perbandingan tanggal/waktu (Hari ini: \${currentDateStr} vs Batas Pengetahuan: Akhir 2024). Analisis apakah data yang ditanyakan ada di dalam memori Anda atau sudah kedaluwarsa.
3. Rencana langkah/strategi (apakah menggunakan data internal, sub-agent, pencarian web, dll).
4. Hasil analisis mendalam atau perdebatan alternatif solusi.
5. Kesimpulan logis sebelum menyusun jawaban akhir.
Tuliskan proses berpikir ini dalam bahasa Indonesia yang natural, logis, dan detail (1-2 paragraf lengkap). Jangan terburu-buru menyimpulkan. Setelah tag </think>, barulah tulis jawaban akhir Anda. Contoh format:
<think>
User menanyakan model AI open source tercanggih saat ini. Hari ini adalah 2 Juni 2026, sedangkan batas pengetahuan saya adalah Oktober 2024. Oleh karena itu, saya harus menyampaikan bahwa pengetahuan saya terbatas hingga akhir 2024 dan saya tidak mengetahui model yang rilis setelah periode tersebut tanpa pencarian web. Berdasarkan memori internal saya, Llama 3.1 405B adalah yang terkuat di akhir 2024. Saya akan menyajikannya dan memberi peringatan tentang kemungkinan model baru di 2026.
</think>
Hingga batas pengetahuan saya (akhir 2024)...

FITUR GRAFIK INTERAKTIF: Jika user meminta untuk membuat grafik (bar/pie/line chart) berdasarkan data, outputkan data tersebut DALAM BENTUK BLOK KODE seperti ini:
<EXAMPLES>
\`\`\`json_chart
{ "title": "Judul Grafik", "type": "bar", "data": [{"name": "A", "value": 10}], "xKey": "name", "yKey": "value" }
\`\`\`
</EXAMPLES>
Pilih type "bar", "pie", atau "line" sesuai kebutuhan.
FITUR ZIP GENERATOR: Jika user meminta Anda membuat file zip (project kodingan), outputkan data DALAM BENTUK BLOK KODE seperti ini (wajib persis):
<EXAMPLES>
\`\`\`xml_zip
<filename>nama_bebas.zip</filename>
<file name="index.html">
<h1>Halo</h1>
</file>
<file name="app.js">
console.log('hi');
</file>
\`\`\`
</EXAMPLES>
DILARANG KERAS MENGGUNAKAN PYTHON ATAU "TOOL_CODE". JANGAN PERNAH MENULISKAN KODE PYTHON UNTUK MENGEKSEKUSI TOOL. JAWABLAH DENGAN TEKS BIASA.

[ANTI-HALLUCINATION CONTRACT]
Jika blok <RAG> dan <MEMORY> kosong, ANDA DILARANG KERAS mengarang fakta, nama file, histori, atau contoh kodingan. Jawab saja bahwa data tidak ditemukan di database internal. Semua yang ada di dalam tag <EXAMPLES> hanyalah panduan format, BUKAN FAKTA RUNTIME!

ATURAN MEMORI (SANGAT PENTING): 
Semua proses penyimpanan memori/fakta dilakukan SECARA OTOMATIS di latar belakang (background) oleh sistem sebelum Anda menjawab. 
DILARANG KERAS memanggil tool memori secara manual. Anda dilarang memberikan konfirmasi teknis penyimpanan memori.
Do not extract memory from messages that are incomplete sentences, iterative corrections, or confirmations like "ya benar", "di sana", "betul". Only store memory after a stable, single-turn final statement.
You are NOT allowed to claim memory is stored.
You must only rely on [MEMORY_SYSTEM_ACK] from system.
If [MEMORY_SYSTEM_ACK] is missing or memory_state is NOT "committed" → treat memory as NOT stored.
Never generate or simulate tool calls.
Only system backend performs memory persistence.
If [MEMORY_SYSTEM_ACK] is MISSING, you MUST NOT state that memory is saved. Instead, just acknowledge the user's message conversationally (e.g., "Baik, saya mengerti", "Terima kasih informasinya"). NEVER OUTPUT AN EMPTY RESPONSE.

Anda memiliki tim Sub-Agent nyata berikut ini:\\n\${getPluginPromptList(ctx.request.tools)}\\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.\`;

  let userContextPrompt = ctx.auth.userName ? \`\\nInformasi Akun: User login dengan email/nama "\${ctx.auth.userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.\` : '';

  if (ctx.request.finalMessage.toLowerCase().includes('zip')) {
    ctx.request.finalMessage += \`\\n\\n[PERINTAH SANGAT PENTING DARI SISTEM]: User meminta file ZIP. Anda DILARANG menggunakan blok kode biasa seperti \`\`\`html. ANDA WAJIB MENGGUNAKAN format \`\`\`xml_zip. 
<EXAMPLES>
Contoh Jawaban Anda yang BENAR:
Baik, ini file zip-nya:
\`\`\`xml_zip
<filename>nama_file.zip</filename>
<file name="index.html">
<!-- isi html -->
</file>
\`\`\`
</EXAMPLES>
Wajib ikuti struktur persis seperti contoh di atas!\`;
  }

  ctx.request.agentIdentityPrompt = agentIdentityPrompt;
  ctx.request.userContextPrompt = userContextPrompt;
  ctx.request.isRagEnabled = ctx.policy.ragTopK > 0;
  ctx.request.effectiveRagMatchCount = ctx.policy.ragTopK;
  ctx.request.effectiveRagThreshold = ctx.policy.ragThreshold;

  return { ctx, rctx };
}
`;
fs.writeFileSync(path.join(libDir, 'request_pipeline.ts'), pipelineTs.trim());
console.log("Middlewares phase 3 done.");
