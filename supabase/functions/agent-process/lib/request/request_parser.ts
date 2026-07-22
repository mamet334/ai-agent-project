import { Buffer } from 'node:buffer';
import { WorkspaceGuardian } from '../workspace_guardian.ts';

export async function parseRequestParams(req: Request, user: any) {
  let reqJson;
  try {
    reqJson = await req.json();
  } catch(e) {
    reqJson = {};
  }
  let { message, tools, model, userId: _clientUserId, userName, file, history, globalMemory, semanticContext, stream, desktopOSMode, ragEnabled, appSource: clientAppSource = 'assistant', workspaceTarget = 'AUTO', localWorkspaceEnabled = false, auditMode = 'OFF', mode: clientMode, provider } = reqJson;
  const mode = clientMode || 'ASSISTANT';
  console.log('[RequestParser] Mode diterima:', mode);

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
      finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${new TextDecoder().decode(buffer).substring(0, 50000)}`;
    } else {
      finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\n(Catatan: Edge Function saat ini memprioritaskan teks/gambar. PDF akan dibaca secara ringkas jika memungkinkan)`;
    }
  }

  return {
    message, finalMessage, tools, model, userName, history, globalMemory, semanticContext, stream, desktopOSMode, ragEnabled, appSource, auditMode, extractedImage, guardianPromptDirective, storageTarget, mode, provider
  };
}