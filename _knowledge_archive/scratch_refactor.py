import re

def refactor_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Replace UnifiedExecutionContext with MametExecutionContext
    content = re.sub(
        r'type UnifiedExecutionContext = \{[\s\S]*?\};',
        '''type MametExecutionContext = {
      auth: { userId: string; userName?: string; };
      request: { originalMessage: string; finalMessage: string; lowerMsg: string; };
      policy: { mode: "AI" | "LITE"; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; };
      state: { ragArray: any[]; memoryArray: any[]; processingSteps: string[]; };
    };''',
        content
    )
    
    # 2. Rewrite buildUnifiedExecutionContext
    old_build_func_regex = r'function buildUnifiedExecutionContext[\s\S]*?const ctx = buildUnifiedExecutionContext[^;]*;'
    
    new_build_func = '''function buildUnifiedExecutionContext(input: { message: string, desktopOSMode?: boolean, tools?: string[], ragEnabled?: boolean, userId: string, userName?: string }): MametExecutionContext {
      const mode = input.desktopOSMode ? "AI" : "LITE";
      const isRagEnabled = input.ragEnabled !== false;
      
      const qLen = (input.message || '').length;
      let dynamicThreshold = 0.60;
      if (qLen < 20) dynamicThreshold = 0.60;
      else if (qLen >= 20 && qLen <= 80) dynamicThreshold = 0.65;
      else dynamicThreshold = 0.68;

      const lowerMsg = (input.message || '').toLowerCase();
      const needsWeb = /terbaru|update|berita|2024|2025|revisi|perubahan|aturan baru/.test(lowerMsg);
      const webHint = needsWeb ? "HIGH_PRIORITY" : "NORMAL";
      
      const ctx: MametExecutionContext = {
        auth: { userId: input.userId, userName: input.userName },
        request: { originalMessage: input.message, finalMessage: input.message, lowerMsg },
        policy: { 
            mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true, 
            riskScore: 0, ragTopK: mode === "LITE" ? 10 : 5, ragThreshold: dynamicThreshold, webHint 
        },
        state: { ragArray: [], memoryArray: [], processingSteps: [] }
      };

      if (!POLICY_LAYER_ENABLED) return ctx;

      let riskScore = 0;
      const injectionPatterns = ["ignore previous instructions", "system prompt", "developer mode", "reveal memory", "bypass"];
      if (injectionPatterns.some(p => lowerMsg.includes(p))) { riskScore += 3; }
      
      const toolAbusePatterns = ["recursive agent requests", "infinite search loops", "mass retrieval requests"];
      if (toolAbusePatterns.some(p => lowerMsg.includes(p))) { riskScore += 2; }
      
      const overRetrievalPatterns = ["all data", "dump all", "entire database"];
      if (overRetrievalPatterns.some(p => lowerMsg.includes(p))) { riskScore += 2; }
      
      if (lowerMsg.length > 5000) riskScore += 1;
      const words = lowerMsg.split(/[\\s\\p{P}]+/);
      const uniqueWords = new Set(words);
      if (words.length > 100 && uniqueWords.size < words.length * 0.1) riskScore += 1;
      
      ctx.policy.riskScore = riskScore;
      
      if (riskScore >= 4) {
        ctx.policy.decision = "BLOCK";
        ctx.policy.toolsEnabled = false;
        ctx.policy.ragTopK = 0;
        ctx.policy.webSearchEnabled = false;
      } else if (riskScore >= 2) {
        ctx.policy.decision = "ALLOW_WITH_LIMIT";
        ctx.policy.toolsEnabled = false;
        ctx.policy.ragTopK = 2;
        ctx.policy.webSearchEnabled = false;
      }
      
      return ctx;
    }

    const ctx = buildUnifiedExecutionContext({ message, desktopOSMode, tools, ragEnabled, userId, userName });'''
    
    content = re.sub(old_build_func_regex, new_build_func, content)
    
    # 3. Replace trace/security accesses
    content = content.replace("ctx.trace.retrievalStrategy !== \"none\"", "ctx.policy.ragTopK > 0")
    content = content.replace("ctx.mode", "ctx.policy.mode")
    content = content.replace("ctx.security.decision", "ctx.policy.decision")
    content = content.replace("ctx.rag.topK", "ctx.policy.ragTopK")
    content = content.replace("ctx.trace.riskScore", "ctx.policy.riskScore")
    content = content.replace("ctx.execution.webHint", "ctx.policy.webHint")
    content = content.replace("ctx.security.toolsEnabled", "ctx.policy.toolsEnabled")
    content = content.replace("ctx.rag.threshold", "ctx.policy.ragThreshold")
    
    # 4. Handle finalMessage updates
    # Find `let finalMessage = message;` and replace with updates to ctx
    content = content.replace("let finalMessage = message;", "ctx.request.finalMessage = ctx.request.originalMessage;")
    content = content.replace("finalMessage =", "ctx.request.finalMessage =")
    
    # Also we need to make sure everywhere `finalMessage` was read, it now reads `ctx.request.finalMessage`
    # Replace independent `finalMessage` reads
    content = re.sub(r'(?<!\.)\bfinalMessage\b', 'ctx.request.finalMessage', content)
    
    # Wait, earlier I replaced `finalMessage =` with `ctx.request.finalMessage =`. 
    # Because of the regex above, it will become `ctx.request.ctx.request.finalMessage =` if I'm not careful.
    # Let's revert and do it cleanly:
    
    # Clean up `userId` -> `ctx.auth.userId`
    content = re.sub(r'(?<!\.)\buserId\b', 'ctx.auth.userId', content)
    # Fix the `let { ..., userId: _clientUserId ...` line
    content = content.replace("ctx.auth.userId: _clientUserId", "userId: _clientUserId")
    content = content.replace("let ctx.auth.userId = AUTH_USER_ID;", "ctx.auth.userId = AUTH_USER_ID;")
    
    # Clean up `userName` -> `ctx.auth.userName`
    content = re.sub(r'(?<!\.)\buserName\b', 'ctx.auth.userName', content)
    content = content.replace("let { message, tools, model, userId: _clientUserId, ctx.auth.userName", "let { message, tools, model, userId: _clientUserId, userName")
    
    # Clean up `ragArray` -> `ctx.state.ragArray`
    content = re.sub(r'let ragArray: any\[\] = \[\];', '', content)
    content = re.sub(r'(?<!\.)\bragArray\b', 'ctx.state.ragArray', content)
    
    # Clean up `memoryArray` -> `ctx.state.memoryArray`
    content = re.sub(r'let memoryArray = ', 'ctx.state.memoryArray = ', content)
    content = re.sub(r'(?<!\.)\bmemoryArray\b', 'ctx.state.memoryArray', content)
    
    # Clean up `processingSteps` -> `ctx.state.processingSteps`
    content = re.sub(r'let processingSteps: string\[\] = \[\];', '', content)
    content = re.sub(r'(?<!\.)\bprocessingSteps\b', 'ctx.state.processingSteps', content)
    
    # Re-fix let { ... } destructurings that got mangled
    content = content.replace("ctx.request.finalMessage = message;", "") # Because it's set in ctx init
    
    # Fix the tempLowerMsg hack I did earlier
    content = content.replace("const tempLowerMsg = (ctx.request.finalMessage || '').toLowerCase();", "ctx.request.lowerMsg = (ctx.request.finalMessage || '').toLowerCase();")
    content = content.replace("tempLowerMsg", "ctx.request.lowerMsg")
    
    # Fix `lowerMessage`
    content = content.replace("const lowerMessage = ctx.request.finalMessage.toLowerCase();", "ctx.request.lowerMsg = ctx.request.finalMessage.toLowerCase();")
    content = content.replace("lowerMessage.", "ctx.request.lowerMsg.")
    content = content.replace("lowerMessage ", "ctx.request.lowerMsg ")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

refactor_file(r'd:\SLAMET\other\ai-agent-project\supabase\functions\agent-process\index.ts')
