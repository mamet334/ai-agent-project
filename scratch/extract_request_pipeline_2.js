const fs = require('fs');
const path = require('path');
const libDir = 'supabase/functions/agent-process/lib/request';

// policy_middleware.ts
const policyTs = `
import { UnifiedExecutionContext } from './types.ts';

export function enforcePolicy(ctx: UnifiedExecutionContext, stream: boolean, corsHeaders: HeadersInit): Response | null {
  if (ctx.request.tools && Array.isArray(ctx.request.tools)) {
    ctx.request.tools = ctx.request.tools.filter(t => {
      if (t === 'cron_manager' && !ctx.policy.canUseAutomation) { console.warn(\`[CAPABILITY_BLOCK] Tool '\${t}' blocked: canUseAutomation=false (mode=\${ctx.policy.mode})\`); return false; }
      if (t === 'file_analyzer' && !ctx.policy.canUseDesktopTools) { console.warn(\`[CAPABILITY_BLOCK] Tool '\${t}' blocked: canUseDesktopTools=false (mode=\${ctx.policy.mode})\`); return false; }
      if (t === 'knowledge_manager' && !ctx.policy.canWriteKnowledge) { console.warn(\`[CAPABILITY_BLOCK] Tool '\${t}' blocked at orchestrator: canWriteKnowledge=false (mode=\${ctx.policy.mode})\`); return false; }
      return true;
    });
  }

  if (ctx.policy.decision === "BLOCK") {
    console.warn(\`[EXECUTION POLICY] Blocked request from user \${ctx.auth.userId} due to HIGH risk. Trace:\`, ctx.trace);
    const blockMsg = "Permintaan ditolak oleh Sistem Kebijakan Eksekusi. Deteksi injeksi atau pola berbahaya.";
    if (!stream) {
      return new Response(JSON.stringify({ message: blockMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      const streamRes = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({ choices: [{ delta: { content: blockMsg } }] });
          controller.enqueue(new TextEncoder().encode(\`data: \${data}\\n\\n\`));
          controller.enqueue(new TextEncoder().encode(\`data: [DONE]\\n\\n\`));
          controller.close();
        }
      });
      return new Response(streamRes, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
    }
  }
  
  if (ctx.policy.decision === "ALLOW_WITH_LIMIT") {
    console.warn(\`[EXECUTION POLICY] Applied limits to user \${ctx.auth.userId} due to MEDIUM risk. Trace:\`, ctx.trace);
  }

  if (!ctx.policy.toolsEnabled && ctx.request.tools && Array.isArray(ctx.request.tools)) {
      ctx.request.tools = []; 
  }
  return null;
}
`;
fs.writeFileSync(path.join(libDir, 'policy_middleware.ts'), policyTs.trim());

// request_parser.ts
const parserTs = `
import { Buffer } from 'node:buffer';
import { WorkspaceGuardian } from '../workspace_guardian.ts';

export async function parseRequestParams(req: Request, user: any) {
  let reqJson;
  try {
    reqJson = await req.json();
  } catch(e) {
    reqJson = {};
  }
  let { message, tools, model, userId: _clientUserId, userName, file, history, globalMemory, stream, desktopOSMode, ragEnabled, appSource: clientAppSource = 'assistant', workspaceTarget = 'AUTO', localWorkspaceEnabled = false, auditMode = 'OFF' } = reqJson;

  const jwtAppSource = user.user_metadata?.app_source as string | undefined;
  const ALLOWED_CLIENT_SOURCES = ['assistant', 'mametlite'];
  const resolvedAppSource: string = jwtAppSource ?? (ALLOWED_CLIENT_SOURCES.includes(clientAppSource) ? clientAppSource : 'assistant');
  const appSource = resolvedAppSource;
  
  if (message && (message.includes('[LOCAL FOLDER CONTENT]') || message.includes('[DESKTOP DIRECTORY ABSOLUTE PATH]'))) {
    localWorkspaceEnabled = true;
  }

  const guardian = new WorkspaceGuardian({
    workspaceTarget,
    localWorkspaceEnabled,
    message: message || ''
  });

  const storageTarget = guardian.determineTarget();
  tools = guardian.filterTools(tools, storageTarget);
  const guardianPromptDirective = guardian.getGuardianPrompt(storageTarget);

  if (history && Array.isArray(history)) {
    history = history.map((msg: any) => {
      if (msg.role === 'model' && typeof msg.content === 'string') {
        msg.content = msg.content.replace(/<call:[^>]+>/gi, '').trim();
      }
      return msg;
    });
  }

  if (history && history.length > 15) {
    history = [
      history[0], 
      { role: 'model', content: '[MAMET HEALER: Memori obrolan lama telah diringkas untuk mencegah kepenuhan memori dan menjaga kestabilan.]' }, 
      ...history.slice(-10)
    ];
  }

  let extractedImage = null;
  let finalMessage = message;

  if (file && file.data) {
    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(file.data, 'base64');
    
    if (file.mimeType.startsWith('image/')) {
      extractedImage = { mimeType: file.mimeType, data: file.data };
    } else if (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.md')) {
      finalMessage = \`Permintaan User: \${message}\\n\\n[DOKUMEN TERLAMPIR: \${file.name}]\\nIsi Dokumen:\\n\${new TextDecoder().decode(buffer).substring(0, 50000)}\`;
    } else {
      finalMessage = \`Permintaan User: \${message}\\n\\n[DOKUMEN TERLAMPIR: \${file.name}]\\n(Catatan: Edge Function saat ini memprioritaskan teks/gambar. PDF akan dibaca secara ringkas jika memungkinkan)\`;
    }
  }

  return {
    message, finalMessage, tools, model, userName, history, globalMemory, stream, desktopOSMode, ragEnabled, appSource, auditMode, extractedImage, guardianPromptDirective, storageTarget
  };
}
`;
fs.writeFileSync(path.join(libDir, 'request_parser.ts'), parserTs.trim());

console.log("Middlewares phase 2 done.");
