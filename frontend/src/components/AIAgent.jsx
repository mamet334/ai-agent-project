  // Helper: Scan workspace files recursively menggunakan batas Ukuran Total (3MB) agar muat jutaan token Gemini
  const scanWorkspaceFiles = async (dirHandle, basePath = '', maxDepth = 5, stats = { count: 0, totalSize: 0, maxSize: 3000000 }) => {
    const results = [];
    const validExts = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py', '.sql', '.csv', '.env', '.yaml', '.yml', '.toml', '.xml', '.sh', '.bat', '.cfg', '.ini', '.log'];
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', '.svelte-kit', 'coverage', '.turbo'];
    
    if (maxDepth <= 0 || stats.totalSize >= stats.maxSize) return results;
    
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (stats.totalSize >= stats.maxSize) break;
        
        const fullPath = basePath ? `${basePath}/${name}` : name;
        
        if (handle.kind === 'directory') {
          if (skipDirs.includes(name)) continue;
          const subResults = await scanWorkspaceFiles(handle, fullPath, maxDepth - 1, stats);
          results.push(...subResults);
        } else if (handle.kind === 'file') {
          const isValid = validExts.some(ext => name.toLowerCase().endsWith(ext));
          if (!isValid) continue;
          
          try {
            const file = await handle.getFile();
            // Lewati file biner atau file raksasa di atas 500KB per file
            if (file.size > 500 * 1024) {
              results.push({ path: fullPath, content: `[FILE TERLALU BESAR: ${(file.size / 1024).toFixed(1)}KB - Dilewati]`, size: file.size });
              continue;
            }
            const text = await file.text();
            stats.totalSize += text.length;
            stats.count += 1;
            results.push({ path: fullPath, content: text, size: file.size });
          } catch (e) {
            results.push({ path: fullPath, content: `[GAGAL MEMBACA: ${e.message}]`, size: 0 });
          }
        }
      }
    } catch (e) {
      console.warn("Folder permission error:", e);
    }
    return results;
  };

  // Helper: Build workspace tree listing (tanpa konten, hanya daftar file/folder)
  const buildWorkspaceTree = async (dirHandle, basePath = '', maxDepth = 4) => {
    const items = [];
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', '.svelte-kit', 'coverage', '.turbo'];
    
    if (maxDepth <= 0) return items;
    
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = basePath ? `${basePath}/${name}` : name;
        if (handle.kind === 'directory') {
          if (skipDirs.includes(name)) continue;
          items.push({ type: 'dir', path: fullPath });
          const subItems = await buildWorkspaceTree(handle, fullPath, maxDepth - 1);
          items.push(...subItems);
        } else {
          items.push({ type: 'file', path: fullPath });
        }
      }
    } catch (e) {
      console.error('Workspace tree error:', e);
    }
    return items;
  };

  const handleSendMessage = async (eOrOverride = null, overrideConvId = null) => {
    if (eOrOverride && eOrOverride.preventDefault) eOrOverride.preventDefault();
    const isStringOverride = typeof eOrOverride === 'string';
    const displayInput = isStringOverride ? eOrOverride : (input || 'Tolong pelajari dokumen ini.');
    if ((!displayInput.trim() && !attachedFile) && !loading) return;
    
    let effectiveConvId = overrideConvId || currentConversationId;

    if (!isStringOverride) {
      setInput('');
      setAttachedFile(null); // Clear early only for actual user inputs
    }
    let apiInput = displayInput;
    const currentFile = attachedFile;
    const currentFileName = currentFile ? currentFile.name : null;

    setInput('');
    const inputEl = document.getElementById('chat-input');
    if (inputEl) inputEl.style.height = '24px';

    setAttachedFile(null); // Clear early
    setLoading(true);
    thinkingStartRef.current = Date.now();
    setLogs(['🔍 Memulai proses...']);

    let filePayload = null;
    if (currentFileName) {
      setLogs(prev => [...prev, `📁 Membaca file: ${currentFileName}...`]);
      try {
        const base64Data = await new Promise((resolve, reject) => {
          if (currentFile.type && currentFile.type.startsWith('image/')) {
            const img = new window.Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const maxDim = 1200;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              resolve(dataUrl.split(',')[1]);
            };
            img.onerror = () => reject(new Error('Gagal memproses gambar'));
            img.src = URL.createObjectURL(currentFile);
          } else if (currentFile.name.toLowerCase().endsWith('.zip')) {
            // Unzip di frontend dan gabungkan semua file teks
            currentFile.arrayBuffer().then(async arrayBuffer => {
              try {
                const JSZip = (await import('jszip')).default;
                const zip = new JSZip();
                const loadedZip = await zip.loadAsync(arrayBuffer);
                let text = `--- KONTEN FILE ZIP (${currentFile.name}) ---\n\n`;
                
                const validExts = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py', '.sql', '.csv'];
                let fileCount = 0;
                
                for (const [filename, zipEntry] of Object.entries(loadedZip.files)) {
                  if (zipEntry.dir) continue;
                  
                  const isTextFile = validExts.some(ext => filename.toLowerCase().endsWith(ext));
                  if (isTextFile) {
                    const content = await zipEntry.async('string');
                    text += `\n\n=== AWAL FILE: ${filename} ===\n${content}\n=== AKHIR FILE: ${filename} ===\n`;
                    fileCount++;
                  }
                }
                
                if (fileCount === 0) text += "Tidak ada file teks/kodingan yang bisa dibaca dalam ZIP ini.";
                
                const base64Str = btoa(unescape(encodeURIComponent(text)));
                resolve(base64Str);
              } catch(err) {
                reject(err);
              }
            });
          } else if (currentFile.name.toLowerCase().endsWith('.xlsx') || currentFile.name.toLowerCase().endsWith('.xls')) {
            // Secretly convert Excel to CSV on the fly!
            currentFile.arrayBuffer().then(async arrayBuffer => {
              try {
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                let text = '';
                workbook.SheetNames.forEach(sheetName => {
                  const sheet = workbook.Sheets[sheetName];
                  text += `\n\n--- Sheet: ${sheetName} ---\n\n` + XLSX.utils.sheet_to_csv(sheet);
                });
                const base64Str = btoa(unescape(encodeURIComponent(text)));
                resolve(base64Str);
              } catch(err) {
                reject(err);
              }
            });
          } else {
            const reader = new FileReader();
            reader.readAsDataURL(currentFile);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
          }
        });

        let finalFileName = currentFile.name;
        if (finalFileName.toLowerCase().endsWith('.xlsx') || finalFileName.toLowerCase().endsWith('.xls')) {
            finalFileName = finalFileName + '.csv'; // Trick the backend into reading it as text
        } else if (finalFileName.toLowerCase().endsWith('.zip')) {
            finalFileName = finalFileName + '.txt'; // Trick backend agar membaca sebagai file teks biasa
        }

        filePayload = {
          name: finalFileName,
          mimeType: currentFile.type && currentFile.type.startsWith('image/') ? 'image/jpeg' : (finalFileName.endsWith('.csv') ? 'text/csv' : (currentFile.type || 'application/octet-stream')),
          data: base64Data
        };
      } catch (err) {
        setLogs(prev => [...prev, `❌ Gagal membaca file: ${err.message}`]);
        setLoading(false);
        return;
      }
    }

    // === DESKTOP OS AWARENESS INJECTION (Dipindah ke systemPrompt via payload) ===
    const isDesktopMode = !!window.electronAPI;

    // === DESKTOP PRE-EXECUTION (STRATEGI BARU: Eksekusi Duluan, AI Interpretasi Kemudian) ===
    // Alih-alih memohon AI mengeluarkan tag <terminal> (yang selalu ditolak oleh RLHF safety),
    // Frontend langsung mendeteksi permintaan lokal dan mengeksekusi perintah yang relevan.
    // Hasilnya di-inject ke pesan agar AI tinggal menyajikan/menganalisis.
    let preExecHandled = false; // Flag agar interceptor tidak re-eksekusi jika Pre-Exec sudah jalan
    if (isDesktopMode) {
      const lowerInput = displayInput.toLowerCase();
      let matchedCmd = null;

      // Pencocokan fleksibel berbasis kata kunci
      const actionWords = ['cek', 'lihat', 'daftar', 'tampilkan', 'buka', 'isi', 'file', 'folder', 'list', 'scan', 'periksa', 'tulis'];
      
      if (lowerInput.includes('desktop') && actionWords.some(w => lowerInput.includes(w))) {
        matchedCmd = 'dir %USERPROFILE%\\Desktop';
      } else if ((lowerInput.includes('dokumen') || lowerInput.includes('document')) && actionWords.some(w => lowerInput.includes(w))) {
        matchedCmd = 'dir %USERPROFILE%\\Documents';
      } else if ((lowerInput.includes('download') || lowerInput.includes('unduh')) && actionWords.some(w => lowerInput.includes(w))) {
        matchedCmd = 'dir %USERPROFILE%\\Downloads';
      } else if (['informasi sistem', 'info komputer', 'spesifikasi', 'spek komputer', 'spec komputer', 'tentang pc'].some(kw => lowerInput.includes(kw))) {
        matchedCmd = 'systeminfo';
      } else if (['ip address', 'alamat ip', 'ip saya', 'koneksi internet', 'jaringan', 'ipconfig'].some(kw => lowerInput.includes(kw))) {
        matchedCmd = 'ipconfig';
      } else if (['proses berjalan', 'task manager', 'daftar proses', 'aplikasi berjalan', 'tasklist'].some(kw => lowerInput.includes(kw))) {
        matchedCmd = 'tasklist /FO TABLE | findstr /V "svchost conhost csrss"';
      } else if (['ruang disk', 'kapasitas hardisk', 'storage', 'disk space', 'sisa hardisk', 'sisa memori'].some(kw => lowerInput.includes(kw))) {
        matchedCmd = 'wmic logicaldisk get size,freespace,caption';
      } else if (['daftar file', 'isi folder', 'lihat folder', 'cek folder', 'tampilkan file', 'tampilkan folder'].some(kw => lowerInput.includes(kw))) {
        matchedCmd = 'dir';
      }

      if (matchedCmd) {
        try {
          setLogs(prev => [...prev, `🖥️ Desktop Pre-Exec: Mengeksekusi "${matchedCmd}"...`]);
          const preResult = await window.electronAPI.runTerminalCommand(matchedCmd);
          if (preResult && preResult.output) {
            apiInput += `\n\n[HASIL EKSEKUSI TERMINAL LANGSUNG DARI KOMPUTER USER - DATA INI NYATA, BUKAN HALUSINASI]\nPerintah yang dijalankan: ${matchedCmd}\nOutput:\n${preResult.output}\n[/HASIL EKSEKUSI TERMINAL]\n\nBerdasarkan data NYATA di atas, jawab permintaan user dengan merangkum dan menyajikan hasilnya secara rapi. DILARANG KERAS mengarang data lain. Gunakan HANYA data yang tertera di atas.`;
            preExecHandled = true;
            setLogs(prev => [...prev, `✅ Desktop Pre-Exec berhasil! Data real injected.`]);
          }
        } catch (preErr) {
          console.error('Desktop Pre-Exec error:', preErr);
          setLogs(prev => [...prev, `⚠️ Desktop Pre-Exec gagal: ${preErr.message}`]);
        }
      }
    } // close if(isDesktopMode) Desktop Pre-Exec

    // === WORKSPACE FILE INJECTION ===
    // Jika user sudah memilih workspace folder, scan dan inject konten file ke dalam pesan
    if (workspaceHandle) {
      try {
        setLogs(prev => [...prev, `📂 Memindai folder kerja (Workspace)...`]);
        const workspaceFiles = await scanWorkspaceFiles(workspaceHandle);
        
        if (workspaceFiles.length > 0) {
          let workspaceContent = '';
          for (const f of workspaceFiles) {
            workspaceContent += `\n=== FILE: ${f.path} (${(f.size / 1024).toFixed(1)}KB) ===\n${f.content}\n=== END FILE ===\n`;
          }
          
          // Inject workspace content yang akan dibaca oleh file_analyzer plugin
          apiInput += `\n\n[LOCAL FOLDER CONTENT]${workspaceContent}[/LOCAL FOLDER CONTENT]`;
          
          setLogs(prev => [...prev, `✅ ${workspaceFiles.length} file workspace berhasil dimuat`]);
        } else {
          apiInput += `\n\n[LOCAL FOLDER CONTENT]EMPTY[/LOCAL FOLDER CONTENT]`;
        }
      } catch (wsErr) {
        console.error('Workspace injection error:', wsErr);
        setLogs(prev => [...prev, `⚠️ Gagal memindai workspace: ${wsErr.message}`]);
      }
    }

    if (desktopWorkspacePath) {
      apiInput += `\n\n[DESKTOP DIRECTORY ABSOLUTE PATH]${desktopWorkspacePath}[/DESKTOP DIRECTORY ABSOLUTE PATH]\nInformasi Tambahan: Folder kerja lokal aktif Anda saat ini berada di direktori lokal: "${desktopWorkspacePath}". Jika Anda perlu mengakses file, mencari file, atau menjalankan perintah di folder kerja ini, lakukan perintah terminal (seperti cd "${desktopWorkspacePath}" diikuti perintah lainnya) terlebih dahulu.`;
    }

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: currentFileName ? `${displayInput}\n\n*(File/Gambar Terlampir: ${currentFileName})*` : (workspaceHandle ? `${displayInput}\n\n*(📂 Workspace Terhubung)*` : displayInput),
      timestamp: new Date(),
    };

    // Update active conversation's messages atomically
    let syncedConvId = effectiveConvId;
    let targetId = effectiveConvId;
    if (effectiveConvId === 'default') {
      targetId = generateUUID();
      syncedConvId = targetId;
    }

    setConversations(prev => {
      const updatedList = prev.map(c => {
        if (c.id === effectiveConvId) {
          const updatedMessages = [...c.messages, userMessage];
          const title = c.title === 'Percakapan Baru' && c.messages.length === 0
            ? (displayInput.length > 25 ? displayInput.substring(0, 25) + '...' : displayInput)
            : c.title;
          const newC = { ...c, id: targetId, title, messages: updatedMessages, updated_at: new Date().toISOString() };
          syncConversationToDB(newC);
          return newC;
        }
        return c;
      });
      return sortConversations(updatedList);
    });
    setCurrentConversationId(targetId);

    setLogs(prev => [...prev, 
      '🔍 Menganalisis permintaan...',
      '🛠️ Mempersiapkan tools: ' + (selectedTools.length > 0 ? selectedTools.join(', ') : 'none')
    ]);

    // Simulate logs stream
    const logIntervals = [
      setTimeout(() => setLogs(p => [...p, '⚡ Menghubungi Model AI (LLM)...']), 600),
      setTimeout(() => setLogs(p => [...p, '🧠 AI sedang merumuskan jawaban terbaik...']), 1300),
    ];

    try {
      // Jika model adalah Kepala Agent (coordinator), otomatis inject semua tools
      // agar logika sub-agent routing di backend tidak pernah ter-bypass
      const effectiveTools = selectedModel === 'coordinator-agent'
        ? ['web_search', 'deep_research', 'youtube_analyst', 'code_executor', 'api_caller', 'logika', 'bahasa', 'debate', 'cron_manager', 'file_analyzer']
        : selectedTools;

      // Use orchestrator to optimize the request
      const task = {
        prompt: apiInput,
        context: messages.map(m => {
          let content = m.content;
          if (m.type === 'user') {
            content = content.replace(/\[LOCAL FOLDER CONTENT\][\s\S]*?\[\/LOCAL FOLDER CONTENT\]/g, '').trim();
          }
          return { role: m.type === 'user' ? 'user' : 'model', content };
        }).slice(-10),
        repeatable: false,
        estimatedTokens: apiInput.length + 1000
      };

      const apiCall = async (optimizedTask, strategy) => {
        let finalMessage = optimizedTask.prompt || '';
        let finalAuditMode = localStorage.getItem('mamet_audit') || 'OFF';

        // 🪄 Magic Keyword Interceptor
        if (finalMessage.toLowerCase().includes('/audit-full')) {
           finalAuditMode = 'FULL';
           finalMessage = finalMessage.replace(/\/audit-full/gi, '').trim();
        } else if (finalMessage.toLowerCase().includes('/audit')) {
           finalAuditMode = 'BASIC';
           finalMessage = finalMessage.replace(/\/audit/gi, '').trim();
        }

        const payload = {
          message: finalMessage,
          file: filePayload,
          tools: effectiveTools,
          model: selectedModel,
          userId: user?.id || 'anonymous',
          userName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Teman',
          globalMemory: globalMemory,
          desktopOSMode: isDesktopMode,
          ragEnabled: ragEnabled,
          stream: true,
          history: optimizedTask.context,
          workspaceTarget: 'AUTO',
          localWorkspaceEnabled: !!(workspaceHandle || desktopWorkspacePath),
          auditMode: finalAuditMode
        };

        // Hardcode ke Supabase Edge Function agar tidak terganggu oleh konfigurasi Vercel yang salah
        const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';

        console.log("[USER_SEND]", { messageLength: payload.message?.length, hasFile: !!payload.file });
        console.log("[FETCH_START]", endpoint);

        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-byok-gemini': (localStorage.getItem('x-byok-gemini') || '').trim(),
              'x-byok-groq': (localStorage.getItem('x-byok-groq') || '').trim(),
              'x-byok-openai': (localStorage.getItem('x-byok-openai') || '').trim(),
              'x-byok-openrouter': (localStorage.getItem('x-byok-openrouter') || '').trim()
            },
            body: JSON.stringify(payload)
          });
          console.log("[FETCH_SUCCESS]", { status: response.status, ok: response.ok });
          return response;
        } catch(e) {
          if (e.name === 'AbortError') {
             console.log("[FETCH_ABORTED]", e);
          } else {
             console.log("[FETCH_FAILED]", e);
          }
          throw e;
        }
      };

      const result = await orchestrator.executeTask(task, apiCall);
      
      // Update token stats
      setTokenStats(result.stats);

      if (result.status === 'budget_exceeded') {
        setLogs(prev => [...prev, '⚠️ Token budget exceeded']);
        setLoading(false);
        return;
      }

      const response = result;

      // Clear pending mock logs timeouts
      logIntervals.forEach(clearTimeout);

      console.log('[DEBUG_RESPONSE_TYPE]', typeof response);
      console.log('[DEBUG_RESPONSE_KEYS]', Object.keys(response || {}));

      // Defensive patch for Orchestrator responses
      if (response && response.status === 'error') {
        console.error('[ORCHESTRATOR_ERROR]', response.error);
        setLogs(prev => [...prev, '⚠️ ' + response.error]);
        
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          content: 'Maaf, terjadi kesalahan saat menyambung ke server: ' + response.error,
          timestamp: new Date().toISOString()
        };
        setConversations(prev => {
          const updated = prev.map(c => {
            if (c.id === effectiveConvId || c.id === syncedConvId) {
              const newC = { ...c, messages: [...c.messages, agentMessage], updated_at: new Date().toISOString() };
              syncConversationToDB(newC);
              return newC;
            }
            return c;
          });
          return updated;
        });
        setLoading(false);
        return;
      }

      if (!response || typeof response.json !== 'function') {
        console.error('[INVALID_RESPONSE_OBJECT]', response);
        setLogs(prev => [...prev, '⚠️ Sistem menerima respons tidak valid']);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server responded with an error');
      }
      
      console.log('[FETCH_RESPONSE_OK]');

      if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
        const metadataHeader = response.headers.get('X-Agent-Metadata');
        let meta = {};
        if (metadataHeader) {
          try {
            meta = JSON.parse(decodeURIComponent(atob(metadataHeader)));
          } catch (e) {
            meta = JSON.parse(metadataHeader); // Fallback for old unencoded format just in case
          }
        }
        
        const thinkingDuration = thinkingStartRef.current ? Math.round((Date.now() - thinkingStartRef.current) / 1000) : 0;
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          content: '',
          tools: meta.toolsUsed || selectedTools,
          groundingSources: meta.groundingSources || [],
          toolExecution: meta.toolExecution || null,
          subagentRuns: meta.subagentRuns || [],
          thinkingLogs: [...logs],
          processingSteps: meta.processingSteps || [],
          thinkingDuration: thinkingDuration,
          timestamp: new Date(),
          isStreaming: true
        };

        // setCurrentlyTypingId(agentMessage.id); // Disabled for streaming so it doesn't re-typewrite
        
        // Push initial empty message
        setConversations(prev => prev.map(c => {
          if (c.id === effectiveConvId || c.id === syncedConvId) {
            return { ...c, messages: [...c.messages, agentMessage] };
          }
          return c;
        }));

        // Hide the generic loading indicator because the message is now streaming
        setLoading(false);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let streamedContent = '';
        let buffer = '';

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            // Simpan baris terakhir yang mungkin belum selesai ke dalam buffer
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                    streamedContent += data.choices[0].delta.content;
                    
                    // ANTI-HALLUCINATION FILTER: Hapus tag <call:...> agar tidak bocor ke UI
                    const cleanContent = streamedContent.replace(/<call:[^>]+>/gi, '').replace(/^\s+/, '');
                    
                    // Update state with new chunk
                    setConversations(prev => prev.map(c => {
                      if (c.id === effectiveConvId || c.id === syncedConvId) {
                        const updatedMessages = c.messages.map(m => 
                          m.id === agentMessage.id ? { ...m, content: cleanContent } : m
                        );
                        return { ...c, messages: updatedMessages };
                      }
                      return c;
                    }));
                  }
                } catch(e) {
                   console.error("Partial JSON parse error:", e, line);
                }
              }
            }
          }
        }
        
        // Streaming finished, sync to DB
        setCurrentlyTypingId(null);
        setConversations(prev => {
          const updatedPrev = prev.map(c => {
            if (c.id === effectiveConvId || c.id === syncedConvId) {
              const updatedMessages = c.messages.map(m => 
                m.id === agentMessage.id ? { ...m, isStreaming: false } : m
              );
              const newC = { ...c, messages: updatedMessages, updated_at: new Date().toISOString() };
              syncConversationToDB(newC);
              return newC;
            }
            return c;
          });
          return sortConversations(updatedPrev);
        });

        // PHASE 3: INTERCEPTOR (ITERATIVE LOOP)
        // PHASE 3: INTERCEPTOR (ITERATIVE LOOP) - Hanya aktif jika Pre-Exec TIDAK menangani
        if (window.electronAPI && !preExecHandled) {
          let interceptHit = false;
          let autoReply = '';

          // 1. Otonomi Terminal (RADAR SAPU JAGAT - menangkap SEMUA format output terminal)
          // Prioritas 1: Tag XML khusus <terminal>
          const termMatch = streamedContent.match(/<terminal>([\s\S]*?)<\/terminal>/i);
          // Prioritas 2: Blok kode Markdown dengan label terminal-like (BUKAN json/python/html/mermaid dll)
          const nonTerminalLangs = ['json', 'json_chart', 'json_zip', 'xml_zip', 'xml', 'mermaid', 'python', 'py', 'javascript', 'js', 'jsx', 'tsx', 'typescript', 'ts', 'html', 'css', 'sql', 'yaml', 'toml', 'markdown', 'md', 'diff', 'plaintext'];
          const mdTermMatch = streamedContent.match(/```([a-zA-Z_]*)[^\n]*\n([\s\S]*?)```/i);
          let mdCmd = null;
          if (mdTermMatch) {
            const lang = (mdTermMatch[1] || '').toLowerCase();
            if (!nonTerminalLangs.includes(lang)) {
              mdCmd = mdTermMatch[2];
            }
          }
          
          if (termMatch || mdCmd) {
             interceptHit = true;
             let rawCmd = termMatch ? termMatch[1].trim() : mdCmd.trim();
             // Bersihkan perintah: hapus prompt symbols dan komentar shell
             rawCmd = rawCmd.split('\n').map(line => line.replace(/^\$\s*/, '').replace(/^>\s*/, '').trim()).filter(l => l && !l.startsWith('#')).join(' && ');
             if (rawCmd) {
               const res = await window.electronAPI.runTerminalCommand(rawCmd);
               autoReply += `\n[SYSTEM: TERMINAL RESULT for "${rawCmd}"]\n${res.output || 'Sukses (Tidak ada output)'}\n`;
             }
          }

          // 2. Surgical File Editing
          const fileMatch = streamedContent.match(/<edit_file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit_file>/i);
          if (fileMatch) {
             interceptHit = true;
             const filePath = fileMatch[1].trim();
             const fileContent = fileMatch[2].trim();
             const res = await window.electronAPI.editFileSurgical(filePath, fileContent);
             autoReply += `\n[SYSTEM: FILE EDIT RESULT for "${filePath}"]\n${res.success ? 'Berhasil disimpan' : 'Gagal: ' + (res.error || res.message)}\n`;
          }

          // 3. Dynamic Global Search (Menggunakan PowerShell Bridge)
          const searchMatch = streamedContent.match(/<search_disk>([\s\S]*?)<\/search_disk>/i);
          if (searchMatch) {
             interceptHit = true;
             const query = searchMatch[1].trim();
             const cmd = `powershell -Command "Get-ChildItem -Path C:\\,D:\\ -Recurse -Filter '*${query}*' -ErrorAction SilentlyContinue | Select-Object -First 20 FullName"`;
             const res = await window.electronAPI.runTerminalCommand(cmd);
             autoReply += `\n[SYSTEM: GLOBAL SEARCH RESULT for "${query}"]\n${res.output || 'Tidak ditemukan file dengan nama tersebut.'}\n`;
          }

          // 4. Docker Sandbox Interceptor (Eksekusi Kode Terisolasi)
          // Deteksi blok kode Python/JS dari respons AI dan eksekusi ulang via Docker lokal
          if (window.electronAPI.runDockerSandbox) {
            const codeBlockMatch = streamedContent.match(/```(python|py|javascript|js)\n([\s\S]*?)```/i);
            if (codeBlockMatch && !interceptHit) {
              try {
                const dockerStatus = await window.electronAPI.checkDockerStatus();
                if (dockerStatus.available) {
                  const codeLang = codeBlockMatch[1].toLowerCase();
                  const codeContent = codeBlockMatch[2].trim();
                  const language = (codeLang === 'py' || codeLang === 'python') ? 'python' : 'javascript';
                  
                  // Hanya eksekusi jika kode cukup pendek dan bukan contoh/template
                  if (codeContent.length > 10 && codeContent.length < 50000 && 
                      (codeContent.includes('print(') || codeContent.includes('console.log'))) {
                    console.log(`[Docker Sandbox] Mengeksekusi ulang kode ${language} via Docker...`);
                    const dockerResult = await window.electronAPI.runDockerSandbox(codeContent, language);
                    
                    if (dockerResult.success) {
                      interceptHit = true;
                      autoReply += `\n[SYSTEM: DOCKER SANDBOX EXECUTION (${language.toUpperCase()})]\nStatus: ✅ Berhasil\nOutput:\n${dockerResult.output}\n`;
                    } else if (dockerResult.error && !dockerResult.error.includes('DOCKER_NOT_AVAILABLE') && !dockerResult.error.includes('DITOLAK')) {
                      interceptHit = true;
                      autoReply += `\n[SYSTEM: DOCKER SANDBOX EXECUTION (${language.toUpperCase()})]\nStatus: ❌ Gagal\nError:\n${dockerResult.error}\n`;
                    }
                    // Jika Docker tidak tersedia atau kode ditolak, diam saja (Piston sudah handle)
                  }
                }
              } catch (dockerErr) {
                console.warn('[Docker Sandbox] Interceptor error:', dockerErr.message);
              }
            }
          }

          // 5. Web3 Airdrop Stealth Browser Interceptor
          const airdropMatch = streamedContent.match(/<run_airdrop\s+([^>]+)>[\s\S]*?(?:<\/run_airdrop>)?/i);
          if (airdropMatch && window.electronAPI.runAirdropStealth) {
             interceptHit = true;
             const attrs = airdropMatch[1];
             const taskMatch = attrs.match(/task=["']([^"']+)["']/i);
             const keepOpenMatch = attrs.match(/keepOpen=["']([^"']+)["']/i);
             const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
             
             const taskName = taskMatch ? taskMatch[1].trim() : 'galxe_campaign';
             const keepOpenVal = keepOpenMatch ? keepOpenMatch[1].trim() === 'true' : false;
             const targetUrl = urlMatch ? urlMatch[1].trim() : null;

             const res = await window.electronAPI.runAirdropStealth(taskName, { keepOpen: keepOpenVal, url: targetUrl });
             autoReply += `\n[SYSTEM: STEALTH BROWSER (AIRDROP FARMER) RESULT for "${taskName}"]\n${res.success ? 'Berhasil: ' + res.message : 'Gagal: ' + res.message}\n`;
          }

          if (interceptHit) {
             const capturedConvId = syncedConvId;
             setTimeout(() => {
                handleSendMessage(`[OS EXECUTION REPORT]\nBerikut adalah hasil eksekusi dari tindakan otomatis Anda di sistem operasi. Silakan analisis dan lanjutkan eksekusi jika tugas belum selesai, atau berikan kesimpulan akhir jika sudah rampung.\n${autoReply}`, capturedConvId);
             }, 1000);
          }
        }

      } else {
        const data = await response.json();
        const thinkingDuration = thinkingStartRef.current ? Math.round((Date.now() - thinkingStartRef.current) / 1000) : 0;
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          content: data.message,
          tools: data.toolsUsed || [],
          groundingSources: data.groundingSources || [],
          toolExecution: data.toolExecution || null,
          subagentRuns: data.subagentRuns || [],
          thinkingLogs: [...logs],
          processingSteps: data.processingSteps || [],
          thinkingDuration: thinkingDuration,
          timestamp: new Date(data.timestamp || Date.now()),
        };

        setCurrentlyTypingId(agentMessage.id);

        setConversations(prev => {
          const updated = prev.map(c => {
            if (c.id === effectiveConvId || c.id === syncedConvId) {
              const newC = { ...c, messages: [...c.messages, agentMessage], updated_at: new Date().toISOString() };
              syncConversationToDB(newC);
              return newC;
            }
            return c;
          });
          return sortConversations(updated);
        });
      }
    } catch (error) {
      console.error('Error contacting backend:', error);
      // Clear pending mock logs timeouts
      logIntervals.forEach(clearTimeout);

      const errorMessage = {
        id: Date.now() + 1,
        type: 'agent',
        content: `Error: Gagal memproses permintaan. ${error.message}. Pastikan server backend Anda berjalan.`,
        timestamp: new Date(),
      };
      setConversations(prev => {
        const updated = prev.map(c => {
          if (c.id === effectiveConvId || c.id === syncedConvId) {
            return { ...c, messages: [...c.messages, errorMessage], updated_at: new Date().toISOString() };
          }
          return c;
        });
        return sortConversations(updated);
      });
    } finally {
      setLoading(false);
      setLogs([]);
    }
  };

  const generateResponse = (query, toolsUsed) => {
    const responses = {
      search: 'Saya menemukan informasi terkait dari web. Data menunjukkan tren positif dalam domain yang Anda tanyakan.',
      code: 'Kode telah dianalisis dan dieksekusi. Hasilnya menunjukkan output yang sesuai dengan ekspektasi.',
      api: 'API berhasil dipanggil. Response diterima dengan status 200 dan data telah diproses.',
      slack: 'Pesan telah dikirim ke channel Slack yang ditentukan.',
    };

    let result = '';
    if (toolsUsed.includes('web_search')) result += responses.search + ' ';
    if (toolsUsed.includes('code_executor')) result += responses.code + ' ';
    if (toolsUsed.includes('api_caller')) result += responses.api + ' ';
    if (toolsUsed.includes('slack_integration')) result += responses.slack + ' ';

    return result || 'Tugas telah diproses dengan sukses.';
  };

  const toggleTool = (tool) => {
    setSelectedTools(prev =>
      prev.includes(tool)
        ? prev.filter(t => t !== tool)
        : [...prev, tool]
    );
  };

  const availableTools = ['web_search', 'deep_research', 'youtube_analyst', 'code_executor', 'api_caller', 'slack_integration', 'logika', 'bahasa', 'debate', 'cron_manager'];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden text-white">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-40 right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
        <div className="z-10 bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-purple-500/30 w-full max-w-md shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-slate-800/80 border border-white/10 rounded-2xl flex items-center justify-center shadow-lg text-purple-400">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2 text-slate-100">AI Agent Platform</h2>
          <p className="text-center text-slate-400 mb-8 text-sm">{isLoginMode ? 'Login untuk menyimpan memori AI Anda' : 'Buat akun untuk memulai'}</p>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 transition-all text-white" placeholder="nama@email.com" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="password" required value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 transition-all text-white" placeholder="••••••••" />
              </div>
            </div>
            {authError && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">{authError}</div>}
            <button type="submit" disabled={authLoading} className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-all shadow-lg shadow-purple-500/30 border border-white/10">
              {authLoading ? 'Memproses...' : (isLoginMode ? 'Sign In' : 'Sign Up')}
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-400">
            {isLoginMode ? 'Belum punya akun? ' : 'Sudah punya akun? '}
            <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-purple-400 hover:text-purple-300 font-medium transition-colors">
              {isLoginMode ? 'Daftar sekarang' : 'Login di sini'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-40 right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      {/* Auto-Update Notification Banner */}
      {showUpdateNotification && updateStatus && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full">
          <div className={`mx-4 p-4 rounded-xl border shadow-2xl backdrop-blur-md ${
            updateStatus.status === 'available' 
              ? 'bg-emerald-900/90 border-emerald-500/50' 
              : updateStatus.status === 'downloading'
              ? 'bg-blue-900/90 border-blue-500/50'
              : updateStatus.status === 'not-available'
              ? 'bg-slate-900/90 border-slate-500/50'
              : 'bg-purple-900/90 border-purple-500/50'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${
                updateStatus.status === 'available' 
                  ? 'bg-emerald-500/20' 
                  : updateStatus.status === 'downloading'
                  ? 'bg-blue-500/20'
                  : updateStatus.status === 'not-available'
                  ? 'bg-slate-500/20'
                  : 'bg-purple-500/20'
              }`}>
                {updateStatus.status === 'available' && <Download className="w-5 h-5 text-emerald-400" />}
                {updateStatus.status === 'downloading' && <Activity className="w-5 h-5 text-blue-400 animate-spin" />}
                {updateStatus.status === 'downloaded' && <Check className="w-5 h-5 text-purple-400" />}
                {updateStatus.status === 'not-available' && <Check className="w-5 h-5 text-slate-400" />}
                {updateStatus.status === 'checking' && <Activity className="w-5 h-5 text-purple-400 animate-spin" />}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">
                  {updateStatus.status === 'checking' && 'Memeriksa Update'}
                  {updateStatus.status === 'available' && 'Update Tersedia'}
                  {updateStatus.status === 'not-available' && 'Aplikasi Sudah Terbaru'}
                  {updateStatus.status === 'downloading' && 'Mengunduh Update'}
                  {updateStatus.status === 'downloaded' && 'Update Siap Diinstal'}
                </h4>
                <p className="text-xs opacity-90 mb-2">
                  {updateStatus.status === 'checking' 
                    ? updateStatus.message 
                    : (updateStatus.message || (updateStatus.version ? `Versi ${updateStatus.version}` : ''))}
                </p>
                {updateStatus.status === 'downloading' && updateStatus.percent && (
                  <div className="w-full bg-black/30 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all" 
                      style={{ width: `${updateStatus.percent}%` }}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  {updateStatus.status === 'available' && (
                    <button
                      onClick={() => {
                        if (window.electronAPI && window.electronAPI.checkForUpdates) {
                          window.electronAPI.checkForUpdates();
                        }
                      }}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Unduh Sekarang
                    </button>
                  )}
                  <button
                    onClick={() => setShowUpdateNotification(false)}
                    className="text-xs bg-black/30 hover:bg-black/50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div 
        id="mamet-workspace-container"
        className="relative flex h-screen overflow-hidden"
        style={{ '--left-width': `${leftWidth}px`, '--right-width': `${rightWidth}px`, '--input-height': `${inputHeight}px` }}
      >
        {/* Sidebar Overlay (Mobile only) */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-[280px] md:w-[var(--left-width)] shrink-0 bg-[#0A0A0A] border-r border-white/5 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:bg-[#0A0A0A] md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          {/* Header */}
          <div className="p-6 border-b border-purple-500/20 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-slate-800/80 border border-white/10 rounded-lg flex items-center justify-center text-purple-400">
                  <Zap className="w-6 h-6" />
                </div>
                <h1 className="text-xl font-bold text-slate-100">
                  AI Agent
                </h1>
              </div>
              <p className="text-xs text-slate-400">Multi-tool integration platform</p>
            </div>
            
            {/* Close button for Mobile */}
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-slate-400 hover:text-white md:hidden rounded-lg hover:bg-slate-800/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-b border-purple-500/20 space-y-2">
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-lg shadow-purple-500/20 text-sm border border-white/10"
            >
              <Plus className="w-4 h-4" />
              Percakapan Baru
            </button>
            <div className="flex items-center gap-2 w-full">
              <button 
                onClick={() => setIsRagModalOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 text-emerald-400 font-semibold transition-all text-sm truncate"
              >
                <BrainCircuit className="w-4 h-4 shrink-0" />
                Knowledge Base
              </button>
              <button
                type="button"
                onClick={() => setRagEnabled(!ragEnabled)}
                className={`px-3 py-2.5 rounded-xl border transition-all text-sm font-semibold flex items-center gap-1.5 ${
                  ragEnabled 
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/5' 
                    : 'bg-slate-800/40 border-slate-700/50 text-slate-500 hover:text-slate-400'
                }`}
                title={ragEnabled ? "RAG Aktif (Klik untuk menonaktifkan)" : "RAG Non-aktif (Klik untuk mengaktifkan)"}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${ragEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                {ragEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Conversations list & Tools Selection */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Conversations Section */}
            <div>
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Riwayat Chat
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {conversations.filter(c => !c.title.startsWith('[AUTO]')).map(conv => (
                  <div key={conv.id} className="relative group flex items-center">
                    <button
                      onClick={() => {
                        setCurrentConversationId(conv.id);
                        setSidebarOpen(false);
                        setActiveView('chat');
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all truncate pr-8 ${
                        conv.id === currentConversationId
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium'
                          : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4 shrink-0 text-purple-400" />
                      <span className="truncate">{conv.title}</span>
                    </button>
                    {conversations.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        className="absolute right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                        title="Hapus percakapan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Auto Reports Section */}
            {conversations.some(c => c.title.startsWith('[AUTO]')) && (
              <div className="pt-4 border-t border-slate-700/50">
                <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Laporan Otomatis
                </h3>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {conversations.filter(c => c.title.startsWith('[AUTO]')).map(conv => (
                    <div key={conv.id} className="relative group flex items-center">
                      <button
                        onClick={() => {
                          setCurrentConversationId(conv.id);
                          setSidebarOpen(false);
                          setActiveView('chat');
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all truncate pr-8 ${
                          conv.id === currentConversationId
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium'
                            : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                        }`}
                      >
                        <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span className="truncate">{conv.title.replace('[AUTO] ', '')}</span>
                      </button>
                      {conversations.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conv.id);
                          }}
                          className="absolute right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                          title="Hapus percakapan"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Token Stats Display (Dinonaktifkan) */}
            {/* 
            {tokenStats && (
              <div className="border-t border-purple-500/20 pt-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Token Usage
                </h3>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400">Used</span>
                    <span className="text-xs font-semibold text-emerald-400">{tokenStats.used}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400">Budget</span>
                    <span className="text-xs font-semibold text-slate-300">{tokenStats.budget}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400">Remaining</span>
                    <span className="text-xs font-semibold text-indigo-400">{tokenStats.remaining}</span>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-emerald-500 to-blue-500 h-2 rounded-full transition-all" 
                        style={{ width: `${tokenStats.percentage}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] text-slate-400 mt-1">{tokenStats.percentage}%</div>
                  </div>
                  <button 
                    onClick={() => {
                      orchestrator.resetUsage();
                      setTokenStats(orchestrator.getStats());
                    }}
                    className="mt-2 w-full text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded transition-all"
                  >
                    Reset Usage
                  </button>
                </div>
              </div>
            )}
            */}

            {/* Auto-Update Section (Electron only) */}
            {window.electronAPI && (
              <div className="border-t border-purple-500/20 pt-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  Auto-Update
                </h3>
                <button
                  onClick={async () => {
                    if (window.electronAPI && window.electronAPI.checkForUpdates) {
                      const result = await window.electronAPI.checkForUpdates();
                      if (result.status === 'error') {
                        alert('Gagal memeriksa update: ' + result.message);
                      } else if (result.status === 'dev-mode') {
                        alert(result.message);
                      } else {
                        setUpdateStatus({ status: 'checking', message: 'Memeriksa pembaruan...' });
                        setShowUpdateNotification(true);
                      }
                    }
                  }}
                  className="w-full text-[10px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 py-2 rounded-lg border border-blue-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Cek Update
                </button>
              </div>
            )}

            {/* Global Memory Section */}
            <div className="border-t border-purple-500/20 pt-4 mb-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                Memori Jangka Panjang
              </h3>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                Tulis aturan, sifat, atau instruksi permanen yang harus selalu dipatuhi Mamet.
              </p>
              <textarea
                value={globalMemory}
                onChange={(e) => setGlobalMemory(e.target.value)}
                placeholder="Cth: Kamu adalah asisten pajak. Selalu panggil saya Bos. Jangan pakai emoji."
                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none min-h-[80px]"
              />
            </div>

            {/* Tools Selection Section */}
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Active Tools
              </h3>
              <div className="space-y-2">
                {availableTools.map(tool => (
                  <button
                    key={tool}
                    onClick={() => toggleTool(tool)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                      selectedTools.includes(tool)
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-white/10'
                        : 'bg-slate-800/40 text-slate-400 hover:bg-slate-700/50'
                    }`}
                  >
                    {toolIcons[tool] || <Plus className="w-4 h-4" />}
                    <div className="text-left flex-1">
                      <div className="font-medium">{tool.replace('_', ' ')}</div>
                      <div className="text-xs opacity-75">{toolDescriptions[tool]}</div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full transition-all ${
                        selectedTools.includes(tool)
                          ? 'bg-green-400 shadow-lg shadow-green-500/50'
                          : 'bg-slate-600'
                      }`}
                    ></div>
                  </button>
                ))}
              </div>
            </div>

            {/* Global Memory Section */}
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                🧠 Memori Global Mamet
              </h3>
              <p className="text-[10px] text-slate-400 mb-2 leading-tight">
                Tuliskan preferensi, konteks proyek, atau gaya bicara. Mamet akan SELALU mengingat ini di setiap percakapan.
              </p>
              <textarea
                value={globalMemory}
                onChange={(e) => setGlobalMemory(e.target.value)}
                placeholder="Contoh: Saya adalah programmer JS. Selalu jawab dengan singkat. Panggil saya Bos."
                className="w-full h-24 bg-slate-900/50 border border-purple-500/30 rounded-lg p-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 resize-none transition-all"
              />
            </div>

            {/* Scheduled Tasks (Cron) Section */}
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                ⏰ Tugas Otomatis (Cron)
              </h3>
              <p className="text-[10px] text-slate-400 mb-3 leading-tight">
                Mamet akan mengerjakan riset/tugas secara mandiri di belakang layar sesuai jadwal.
              </p>
              
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => setActiveView('cron')}
                  className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'cron' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                >
                  <Clock className="w-3.5 h-3.5" /> Dashboard Automasi
                </button>
              </div>
            </div>

            {isDeveloperMode && (
              <>
                <div className="border-t border-purple-500/20 pt-4">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    📈 Server Monitoring
                  </h3>
                  <p className="text-[10px] text-slate-400 mb-3 leading-tight">
                    Pantau Uptime & Performa web app.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => setActiveView('monitoring')}
                      className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'monitoring' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                    >
                      <Activity className="w-3.5 h-3.5" /> Dashboard Monitoring
                    </button>
                  </div>
                </div>

                {/* Billing & Quota Section */}
                <div className="border-t border-purple-500/20 pt-4">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    💳 Billing & Quota
                  </h3>
                  <p className="text-[10px] text-slate-400 mb-3 leading-tight">
                    Pantau pengeluaran token AI harian.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => setActiveView('billing')}
                      className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'billing' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Quota Token AI
                    </button>
                  </div>
                </div>

                <div className="border-t border-purple-500/20 pt-4">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    🛍️ Shopee Affiliate
                  </h3>
                  <p className="text-[10px] text-slate-400 mb-3 leading-tight">
                    Antrean & Auto-Post promosi Shopee.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => setActiveView('shopee')}
                      className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'shopee' ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> Shopee Ninja
                    </button>
                      <button
                        onClick={() => setActiveView('observability')}
                        className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'observability' ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                      >
                        <Activity className="w-4 h-4" /> Observability
                      </button>
                      <button
                        onClick={() => setActiveView('memoryhealth')}
                        className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'memoryhealth' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                      >
                        <Database className="w-4 h-4" /> Mem Health
                      </button>
                      <button
                        onClick={() => setActiveView('work')}
                        className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'work' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                      >
                        <Briefcase className="w-4 h-4" /> Work Track
                      </button>
                      <button
                        onClick={() => setActiveView('engineer')}
                        className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'engineer' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                      >
                        <Terminal className="w-4 h-4" /> Engineer
                      </button>
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Examples
              </h3>
              <div className="space-y-2">
                {[
                  'Cari info terbaru tentang AI',
                  'Jalankan tugas otomasi',
                  'Integrasikan dengan Slack',
                  'Call REST API',
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(example)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-purple-400 rounded-lg hover:bg-slate-800/40 transition-all"
                  >
                    → {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Settings & User */}
          <div className="p-4 border-t border-purple-500/20 space-y-2">
            <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 truncate">
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              <button 
                onClick={() => setIsDeveloperMode(!isDeveloperMode)}
                className={`p-1 rounded transition-colors ${isDeveloperMode ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-slate-800'}`}
                title="Toggle Developer Mode"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsSettingsModalOpen(true)} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-700/50 transition-all text-sm font-medium">
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button onClick={() => supabase.auth.signOut()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-sm font-medium">
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Left Resizer */}
        <div 
          className="hidden md:block w-1.5 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors z-40 shrink-0"
          onPointerDown={(e) => startResizing('left', e)}
          onDoubleClick={() => resetWidth('left')}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full relative">
          {/* Top Bar Header (Desktop & Mobile) */}
          <div className="flex items-center justify-between px-6 py-4 bg-[#0A0A0A] border-b border-white/5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800/40 border border-purple-500/20 md:hidden mr-1"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Zap className="w-5 h-5 text-purple-400 font-semibold" />
              <div className="flex flex-col">
                <span className="font-bold text-slate-100 leading-tight">AI Agent</span>
                <span className="text-[10px] text-slate-500 font-medium tracking-wider">powered by mametdev@™</span>
              </div>
            </div>

            {/* Model Selector Dropdown & Manage Custom Model */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-slate-400">Brain Model:</span>
              <div className="flex items-center gap-1.5 bg-slate-800 border border-purple-500/30 rounded-lg px-2 py-1">
                <select
                  value={selectedModel}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'ADD_CUSTOM_MODEL') {
                      const modelName = prompt(
                        "Masukkan model kustom baru Anda.\n\nContoh format:\n- OpenRouter: openrouter/author/model (cth: openrouter/google/gemini-2.5-pro)\n- Groq: groq/model (cth: groq/mixtral-8x7b-32768)\n- OpenAI: nama-model-openai (cth: gpt-3.5-turbo)"
                      );
                      if (modelName && modelName.trim()) {
                        const cleanName = modelName.trim();
                        if (!customModels.includes(cleanName)) {
                          setCustomModels(prev => [...prev, cleanName]);
                        }
                        setSelectedModel(cleanName);
                      }
                    } else {
                      setSelectedModel(val);
                    }
                  }}
                  className="bg-transparent text-purple-200 text-xs focus:outline-none transition-all font-medium cursor-pointer max-w-[180px] sm:max-w-xs"
                >
                  {/* 1. KEPALA AGENT (AUTO-ROUTER) */}
                  <optgroup label="🤖 KEPALA AGENT (AUTO-ROUTER)" className="bg-slate-800 text-purple-300 font-bold">
                    <option value="coordinator-agent" className="bg-slate-900 text-white font-normal">Kepala Agent (Multi-Agent Orchestrator)</option>
                  </optgroup>

                  {/* 2. MODEL GOOGLE GEMINI (GRATIS & KONTEKS BESAR) */}
                  <optgroup label="💎 GOOGLE GEMINI (GRATIS & KONTEKS BESAR)" className="bg-slate-800 text-emerald-400 font-bold">
                    <option value="gemini-2.5-flash" className="bg-slate-900 text-white font-normal">Gemini 2.5 Flash (Cepat, Gratis, 1M token)</option>
                    <option value="gemini-2.5-pro" className="bg-slate-900 text-white font-normal">Gemini 2.5 Pro (Sangat Pintar, Gratis, 1M token)</option>
                  </optgroup>

                  {/* 3. MODEL KUSTOM DARI DROPDOWN (Yang sudah Anda tambahkan sebelumnya) */}
                  {customModels.map((m) => {
                    const label = m.includes('/') ? m.substring(m.lastIndexOf('/') + 1) : m;
                    return (
                      <optgroup key={m} label={`📦 KUSTOM: ${label}`} className="bg-slate-800 text-orange-400">
                        <option value={m} className="bg-slate-900 text-white">{m}</option>
                      </optgroup>
                    );
                  })}

                  {/* 4. TAMBAH MODEL KUSTOM BARU (Input manual) */}
                  <option value="ADD_CUSTOM_MODEL" className="text-purple-400 font-semibold bg-slate-900">+ Tambah Model Kustom...</option>
                </select>

                {/* Trash button to delete currently selected custom model */}
                {customModels.includes(selectedModel) && (
                  <button
                    onClick={() => {
                      if (confirm(`Apakah Anda yakin ingin menghapus model kustom "${selectedModel}"?`)) {
                        setCustomModels(prev => prev.filter(m => m !== selectedModel));
                        setSelectedModel('coordinator-agent'); // Fallback to coordinator
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-red-400 rounded transition-colors"
                    title="Hapus Model Kustom Ini"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          {activeView === 'monitoring' ? (
            <MonitoringDashboard />
          ) : activeView === 'billing' ? (
            <BillingDashboard user={user} />
          ) : activeView === 'shopee' ? (
            <ShopeeDashboard />
          ) : activeView === 'observability' ? (
            <ObservabilityDashboard />
          ) : activeView === 'memoryhealth' ? (
            <MemoryHealthDashboard />
          ) : activeView === 'work' ? (
            <WorkDashboard />
          ) : activeView === 'engineer' ? (
            <EngineerDashboard userId={user?.id} />
          ) : activeView === 'cron' ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0A0A0A]">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                      <Clock className="w-6 h-6 text-emerald-400" />
                      Dashboard Automasi (Cron)
                    </h2>
                    <p className="text-slate-400 mt-2 text-sm">
                      Kelola jadwal agen AI untuk berjalan otomatis di latar belakang.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsCronModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Tambah Jadwal Baru
                  </button>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                  {scheduledTasks.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-slate-500" />
                      </div>
                      <h3 className="text-lg font-medium text-slate-300 mb-2">Belum Ada Tugas Otomatis</h3>
                      <p className="text-slate-500 text-sm">Tambahkan jadwal baru agar Mamet bisa bekerja selagi Anda tidur.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/80 border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                          <th className="p-4 font-medium">Tugas & Instruksi</th>
                          <th className="p-4 font-medium">Jadwal</th>
                          <th className="p-4 font-medium text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledTasks.map(task => (
                          <tr key={task.id} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                            <td className="p-4">
                              <div className="font-medium text-purple-300 mb-1">{task.title}</div>
                              <div className="text-xs text-slate-400 line-clamp-2 max-w-lg">{task.prompt}</div>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Setiap {task.interval_hours} Jam
                              </span>
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                              <button 
                                onClick={() => handleEditCronClick(task)}
                                className="p-2 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors border border-transparent hover:border-blue-500/30"
                                title="Edit Tugas"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteCron(task.id)}
                                className="p-2 text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                                title="Hapus Tugas"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-6xl mx-auto w-full min-h-full flex flex-col space-y-6">
                  {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-slate-800/80 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-2xl text-purple-400">
                  <Zap className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold mb-2">Selamat datang di AI Agent</h2>
                <p className="text-slate-400 max-w-md mb-8">
                  Pilih tools yang ingin digunakan, kemudian mulai percakapan. Agent akan memproses permintaan menggunakan kombinasi tools yang Anda aktifkan.
                </p>
                <div className="flex gap-2">
                  {selectedTools.map(tool => (
                    <div key={tool} className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-300">
                      {toolIcons[tool]}
                      {tool.replace('_', ' ')}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                  >
                    <div
                      className={`relative max-w-[95%] md:max-w-4xl ${
                        message.type === 'user'
                          ? 'bg-slate-800 border border-white/5 rounded-2xl rounded-tr-sm text-slate-200'
                          : 'bg-slate-800/50 backdrop-blur rounded-2xl rounded-tl-sm border border-purple-500/30 pb-10'
                      } px-3 md:px-5 py-2.5 md:py-3.5`}
                    >
                      {/* Reasoning Shortcut */}
                      {message.type === 'agent' && !message.isStreaming && message.content && (
                        <div className="flex justify-end mb-2">
                          <button 
                            onClick={() => {
                              setInspectorFocusedId(message.id);
                              setOpenInspectorSection('reasoning');
                            }}
                            className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 border border-white/5 rounded-md px-2.5 py-1.5 bg-[#0A0A0A]/50 transition-colors w-max shadow-sm"
                          >
                            <BrainCircuit className="w-3 h-3 opacity-70" /> View Reasoning
                          </button>
                        </div>
                      )}

                      {/* DeepSeek-style Chain-of-Thought (parsed from <think> tags + real backend steps) */}
                      {message.type === 'agent' && (() => {
                        const { thinking, isThinkingComplete } = parseThinkingContent(message.content);
                        return (thinking || (message.processingSteps && message.processingSteps.length > 0)) ? (
                          <ThinkingBlock 
                            thinking={thinking} 
                            processingSteps={message.processingSteps} 
                            duration={message.thinkingDuration}
                            isThinkingComplete={!message.isStreaming || isThinkingComplete}
                          />
                        ) : null;
                      })()}

                      {message.type === 'agent' && currentlyTypingId === message.id && !message.isStreaming
                        ? <TypewriterText text={parseThinkingContent(message.content).answer} onComplete={() => setCurrentlyTypingId(null)} workspaceHandle={workspaceHandle} />
                        : message.type === 'agent'
                          ? (() => {
                              const parsed = parseThinkingContent(message.content);
                              let answerText = parsed.answer;
                              if (message.isStreaming && parsed.isThinkingComplete) {
                                answerText += ' ▍';
                              }
                              return <MessageContent text={answerText} workspaceHandle={workspaceHandle} />;
                            })()
                          : <MessageContent text={message.content || ''} workspaceHandle={workspaceHandle} />
                      }
                      
                      {message.type === 'agent' && !message.isStreaming && message.content && (
                        <CopyButton text={parseThinkingContent(message.content).answer} />
                      )}

                      {message.response && (
                        <div className="mt-3 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-300 border border-slate-700/50">
                          {message.response}
                        </div>
                      )}
                      {message.tools && message.tools.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 mb-2">
                          {message.tools.map(tool => (
                            <span
                              key={tool}
                              className="text-xs px-2 py-1 bg-slate-700/50 rounded-full flex items-center gap-1"
                            >
                              {toolIcons[tool]}
                              {tool.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.groundingSources && message.groundingSources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-purple-500/10">
                          <p className="text-[10px] text-slate-400 font-semibold mb-1.5 uppercase tracking-wider">Sumber Referensi:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {message.groundingSources.map((source, index) => (
                              <a
                                key={index}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/25 transition-all truncate max-w-xs inline-flex items-center gap-1"
                              >
                                <Zap className="w-2.5 h-2.5 shrink-0" />
                                {source.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {message.toolExecution && (
                        <div className="mt-3 p-3 bg-slate-900/80 rounded-lg text-[11px] border border-purple-500/20 font-mono">
                          <div className="flex items-center gap-1.5 text-purple-400 font-semibold mb-1.5">
                            <Code2 className="w-3.5 h-3.5" />
                            Eksekusi Tool: {message.toolExecution.name}
                          </div>
                          <div className="text-slate-300 bg-black/40 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {message.toolExecution.name === 'execute_javascript' && (
                              <>
                                <span className="text-slate-500">// Kode yang dijalankan:</span>
                                <pre className="text-blue-300 mt-1">{message.toolExecution.args.code}</pre>
                              </>
                            )}
                            {message.toolExecution.name === 'make_api_call' && (
                              <>
                                <span className="text-slate-500">// HTTP Request:</span>
                                <div className="text-green-300 mt-1">{message.toolExecution.args.method} {message.toolExecution.args.url}</div>
                                {message.toolExecution.args.body && (
                                  <pre className="text-yellow-300 mt-1 text-[10px]">{message.toolExecution.args.body}</pre>
                                )}
                              </>
                            )}
                            {message.toolExecution.name === 'post_to_slack' && (
                              <>
                                <span className="text-slate-500">// Kirim Slack:</span>
                                <div className="text-yellow-300 mt-1">{message.toolExecution.args.message}</div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {message.subagentRuns && message.subagentRuns.length > 0 && (
                        <details className="mt-4 group">
                          <summary className="text-xs font-semibold text-slate-400 hover:text-purple-400 flex items-center gap-2 cursor-pointer list-none transition-colors select-none">
                            <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700/50 group-hover:border-purple-500/30">
                              <BrainCircuit className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                              <span>Proses Orkestrasi AI ({message.subagentRuns.length} langkah)</span>
                              <svg className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </summary>
                          <div className="mt-3 border-l-2 border-purple-500/30 pl-4 space-y-4 ml-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            {message.subagentRuns.map((run, idx) => (
                              <div key={idx} className="relative">
                                {/* Pip node */}
                                <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-purple-500 border border-slate-950 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                                
                                <div className="bg-slate-950/60 rounded-xl p-3 border border-purple-500/10 text-xs">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-bold text-blue-400 capitalize">
                                      🤖 Sub-Agent: {run.subagent}
                                    </span>
                                    <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded font-mono">
                                      SUCCESS
                                    </span>
                                  </div>
                                  <div className="text-slate-400 italic mb-1.5">
                                    Tugas: {run.task}
                                  </div>
                                  <div className="text-slate-300 bg-black/40 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto font-sans leading-relaxed text-[11px]">
                                    {run.output}
                                  </div>
                                  
                                  {/* Grounding sources for the subagent if any */}
                                  {run.sources && run.sources.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-800/40">
                                      <div className="text-[10px] text-slate-400 mb-1">Referensi:</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {run.sources.map((src, sIdx) => (
                                          <a
                                            key={sIdx}
                                            href={src.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-purple-300 hover:text-purple-100 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full transition-all truncate max-w-xs flex items-center gap-1"
                                          >
                                            <Zap className="w-2.5 h-2.5" /> {src.title}
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Tool execution details for the subagent if any */}
                                  {run.toolExecution && (
                                    <div className="mt-2 pt-2 border-t border-slate-800/40 font-mono text-[9px] text-purple-400 flex items-center gap-1">
                                      <Code2 className="w-3 h-3" />
                                      Eksekusi Tool: {run.toolExecution.name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <div className="text-xs opacity-50 mt-2">
                        {message.timestamp.toLocaleTimeString('id-ID')}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-800/50 backdrop-blur rounded-3xl rounded-tl-lg border border-purple-500/30 px-4 py-3 max-w-md w-full">
                      <details className="group" open>
                        <summary className="text-xs font-semibold text-slate-400 hover:text-purple-400 flex items-center gap-2 cursor-pointer list-none transition-colors select-none">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-200"></div>
                            <span className="ml-1 text-purple-400 italic font-mono">Berpikir dan Orkestrasi...</span>
                            <svg className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </summary>
                        <div className="mt-3 ml-2 border-l-2 border-purple-500/20 pl-3">
                          <div className="font-mono text-[10px] text-purple-300 space-y-1 bg-slate-950/70 p-3 rounded-lg border border-purple-500/10 max-h-40 overflow-y-auto w-full">
                            {logs.map((log, index) => (
                              <div key={index} className="flex items-start gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-green-500 select-none mt-0.5">&gt;</span>
                                <span className="leading-relaxed">{log}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
                </div>
          </div>

          {/* Input Area */}
          <div className="relative shrink-0 w-full border-t border-purple-500/30 bg-slate-900/80 backdrop-blur-md p-2 md:py-3 md:px-4 z-20">
            <div className="max-w-6xl mx-auto w-full">
            
            {/* File attachment preview */}
            {attachedFile && (
              <div className="mb-3 flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2 w-max animate-in fade-in slide-in-from-bottom-2">
                {attachedFile.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-purple-400" /> : <FileText className="w-4 h-4 text-purple-400" />}
                <span className="text-xs text-purple-200 truncate max-w-[200px]">{attachedFile.name}</span>
                <button onClick={() => setAttachedFile(null)} className="ml-2 text-slate-400 hover:text-red-400 p-0.5 rounded-full hover:bg-slate-800/50 transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="bg-slate-800/50 border border-purple-500/30 rounded-2xl p-1.5 md:py-2 md:px-3 transition-all focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 shadow-lg relative flex flex-col">
              {/* Top Resizer Handle */}
              <div 
                className="w-16 h-1 mx-auto bg-white/5 hover:bg-white/20 active:bg-white/30 rounded-full cursor-row-resize transition-colors mb-1 shrink-0"
                onPointerDown={(e) => startResizing('input', e)}
                onDoubleClick={() => resetWidth('input')}
              />
              
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".zip,.pdf,.txt,.md,.csv,.xlsx,.xls,.docx,image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setAttachedFile(e.target.files[0]);
                  }
                }}
              />
              
              <textarea
                id="chat-input"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  const target = e.target;
                  setTimeout(() => {
                    target.style.height = '20px';
                    target.style.height = `${target.scrollHeight}px`;
                  }, 0);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ketik permintaan atau pertanyaan... (Shift+Enter untuk baris baru)"
                className="w-full bg-transparent border-none outline-none text-white placeholder-slate-500 resize-none overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/30 px-2 py-0 mb-0"
                style={{
                  height: input === '' ? 'var(--input-height, 24px)' : undefined,
                  minHeight: 'var(--input-height)',
                  maxHeight: 'max(180px, var(--input-height))'
                }}
                disabled={loading}
                rows="1"
              />

              {/* Taskbar / Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="p-2 text-slate-400 hover:text-purple-400 hover:bg-slate-700/50 rounded-xl transition-colors focus:outline-none disabled:opacity-50"
                    title="Lampirkan Dokumen (PDF, TXT, DOCX)"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleSelectWorkspace}
                    disabled={loading}
                    className={`p-2 rounded-xl transition-colors focus:outline-none disabled:opacity-50 ${
                      (workspaceHandle || desktopWorkspacePath)
                        ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                        : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50'
                    }`}
                    title={(workspaceHandle || desktopWorkspacePath) ? "Workspace Terhubung! Klik untuk memutuskan sambungan" : "Hubungkan Folder Kerja (Workspace)"}
                  >
                    <FolderOpen className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={loading || (!input.trim() && !attachedFile)}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl px-5 py-2 font-medium flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20 disabled:shadow-none border border-white/10"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Active tools: {selectedTools.length > 0 ? selectedTools.join(', ') : 'none selected'}
            </p>
            </div>
          </div>
          </>
          )}
        </div>

        {/* Right Resizer */}
        <div 
          className="hidden xl:block w-1.5 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors z-40 shrink-0"
          onPointerDown={(e) => startResizing('right', e)}
          onDoubleClick={() => resetWidth('right')}
        />

        {/* Right Panel (Inspector) */}
        <div className="hidden xl:flex w-[var(--right-width)] shrink-0 bg-[#0A0A0A] border-l border-white/5 flex-col overflow-hidden z-30 font-sans text-slate-300">
          <div className="h-14 px-4 border-b border-white/5 flex items-center justify-between bg-[#0A0A0A] shrink-0">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              Inspector
            </h2>
            {inspectorData && inspectorData.isStreaming && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto bg-[#0A0A0A] flex flex-col scrollbar-thin scrollbar-thumb-white/10">
            {inspectorData ? (
              <div className="flex flex-col">
                
                {/* EXECUTION CARD (Sticky) */}
                <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-medium text-slate-400">Execution</h3>
                    <div className="flex items-center gap-1.5">
                      {inspectorData.isStreaming ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] text-emerald-500 font-medium tracking-wider uppercase">Live</span>
                        </>
                      ) : (
                        <>
                          <span className="text-blue-500 text-[10px]">✓</span>
                          <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Complete</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Duration</span>
                    <span className="text-[11px] font-mono text-slate-300">{inspectorData.duration}s</span>
                  </div>

                  {inspectorData.execution.length > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Processing Steps</span>
                      <div className="space-y-1.5">
                        {inspectorData.execution.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-snug">
                            <span className="text-blue-500 mt-0.5 opacity-70">✓</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* REASONING CARD */}
                {(inspectorParsedContent.thinking || inspectorData.execution.length > 0) && (
                  <details 
                    className="group border-b border-white/5" 
                    open={openInspectorSection === 'reasoning'}
                  >
                    <summary className="text-[11px] font-medium text-slate-400 p-4 cursor-pointer select-none flex items-center gap-1.5 outline-none transition-colors hover:text-slate-300">
                      <BrainCircuit className="w-3 h-3 opacity-70" /> Reasoning
                      <svg className="w-2.5 h-2.5 ml-auto group-open:rotate-180 transition-transform opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="px-4 pb-4">
                      <ThinkingBlock 
                        thinking={inspectorParsedContent.thinking} 
                        processingSteps={inspectorData.execution} 
                        duration={inspectorData.duration}
                        isThinkingComplete={!inspectorData.isStreaming || inspectorParsedContent.isThinkingComplete}
                      />
                    </div>
                  </details>
                )}

                {/* KNOWLEDGE BASE CARD */}
                <div className="border-b border-white/5 p-4 space-y-2">
                  <h3 className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    <Database className="w-3 h-3 opacity-70" /> Knowledge Base
                  </h3>
                  <div className="text-[11px] text-slate-300">
                    {knowledgeBase.length} Files Loaded
                  </div>
                  {knowledgeBase.length > 0 && (
                    <details className="group cursor-pointer">
                      <summary className="text-[10px] text-slate-500 hover:text-slate-300 select-none flex items-center gap-1 mt-1 transition-colors outline-none">
                        <svg className="w-2.5 h-2.5 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        View Details
                      </summary>
                      <div className="mt-2 space-y-1.5 pl-3 border-l border-white/5">
                        {knowledgeBase.map(doc => (
                          <div key={doc.id} className="text-[10px] text-slate-400 truncate" title={doc.title}>
                            {doc.title}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* AUDIT CARD */}
                <div className="border-b border-white/5 p-4 space-y-2">
                  <h3 className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 opacity-70" /> Audit
                  </h3>
                  <div className="text-[11px] text-slate-500 italic">
                    No audit data available
                  </div>
                </div>

                {/* ADVANCED SECTION */}
                <div className="p-4">
                  <details className="group cursor-pointer">
                    <summary className="text-[11px] font-medium text-slate-400 hover:text-slate-300 select-none flex items-center gap-1.5 outline-none transition-colors">
                      <Settings className="w-3 h-3 opacity-70" /> Advanced
                      <svg className="w-2.5 h-2.5 ml-auto group-open:rotate-180 transition-transform opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="mt-3 space-y-3 pl-1">
                      
                      <details className="group/sub cursor-pointer">
                        <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                          <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Tools
                        </summary>
                        <div className="mt-1.5 pl-4 text-[10px] text-slate-500">
                          {inspectorData.tools.length > 0 ? inspectorData.tools.join(', ') : 'No tools used'}
                        </div>
                      </details>

                      <details className="group/sub cursor-pointer">
                        <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                          <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Subagents
                        </summary>
                        <div className="mt-1.5 pl-4 text-[10px] text-slate-500 italic">No subagents active</div>
                      </details>

                      <details className="group/sub cursor-pointer">
                        <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                          <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Memory
                        </summary>
                        <div className="mt-1.5 pl-4 text-[10px] text-slate-500 italic">No memory accessed</div>
                      </details>

                      <details className="group/sub cursor-pointer">
                        <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                          <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Workspace
                        </summary>
                        <div className="mt-1.5 pl-4 text-[10px] text-slate-500 italic">No workspace context</div>
                      </details>

                      <details className="group/sub cursor-pointer">
                        <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                          <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Debug JSON
                        </summary>
                        <div className="mt-2 pl-2">
                          <pre className="text-[9px] text-slate-500 font-mono bg-white/5 p-2 rounded overflow-x-auto max-h-40">
                            {JSON.stringify(inspectorData.rawJson, null, 2)}
                          </pre>
                        </div>
                      </details>
                      
                    </div>
                  </details>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-600 text-center">
                <Activity className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-[11px]">Waiting for agent response...</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Cron Settings Modal */}
      {isCronModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/20 flex justify-between items-center bg-slate-800/50">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                {cronForm.id ? 'Edit Jadwal Agen (Cron)' : 'Tambah Jadwal Agen (Cron)'}
              </h2>
              <button onClick={() => setIsCronModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCronSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Judul Tugas</label>
                <input 
                  type="text" 
                  required
                  value={cronForm.title}
                  onChange={e => setCronForm({...cronForm, title: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Cth: Riset Harga Kripto Harian"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Instruksi Prompt</label>
                <textarea 
                  required
                  value={cronForm.prompt}
                  onChange={e => setCronForm({...cronForm, prompt: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 h-24 resize-none focus:outline-none focus:border-emerald-500"
                  placeholder="Ketik prompt lengkap di sini..."
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Jadwal Eksekusi</label>
                <select 
                  value={cronForm.interval_hours}
                  onChange={e => setCronForm({...cronForm, interval_hours: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value={1}>Setiap 1 Jam</option>
                  <option value={6}>Setiap 6 Jam</option>
                  <option value={12}>Setiap 12 Jam</option>
                  <option value={24}>Setiap 24 Jam (Harian)</option>
                  <option value={168}>Setiap 7 Hari (Mingguan)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsCronModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={cronLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {cronLoading ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal (BYOK) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md shadow-2xl shadow-purple-500/20 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/20 bg-slate-800/50 flex-shrink-0">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-400" />
                Bring Your Own Key (BYOK)
              </h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <p className="text-xs text-slate-400 mb-4">
                Masukkan API Key milik Anda sendiri untuk menggunakan model tanpa memotong kuota pusat. Key disimpan secara aman di browser Anda.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 ml-1">OpenAI API Key (ChatGPT)</label>
                <input
                  type="password"
                  value={byokKeys.openai}
                  onChange={(e) => setByokKeys({ ...byokKeys, openai: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 ml-1">Groq API Key (Llama 3)</label>
                <input
                  type="password"
                  value={byokKeys.groq}
                  onChange={(e) => setByokKeys({ ...byokKeys, groq: e.target.value })}
                  placeholder="gsk_..."
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 ml-1">OpenRouter API Key (DeepSeek)</label>
                <input
                  type="password"
                  value={byokKeys.openrouter}
                  onChange={(e) => setByokKeys({ ...byokKeys, openrouter: e.target.value })}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 ml-1">Gemini API Key</label>
                <input
                  type="password"
                  value={byokKeys.gemini}
                  onChange={(e) => setByokKeys({ ...byokKeys, gemini: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>

              <div className="pt-4 border-t border-slate-700/50 space-y-3">
                <h4 className="text-xs font-semibold text-rose-400 mb-2">Pusat Keamanan Darurat</h4>
                <button
                  onClick={handleKillSwitch}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600/10 text-rose-400 border border-rose-600/30 hover:bg-rose-600 hover:text-white transition-all text-sm font-medium"
                >
                  <AlertTriangle className="w-4 h-4" /> KILL SWITCH (Matikan Cron)
                </button>
                <button
                  onClick={handleClearMemory}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600/10 text-amber-400 border border-amber-600/30 hover:bg-amber-600 hover:text-white transition-all text-sm font-medium"
                >
                  <BrainCircuit className="w-4 h-4" /> Bakar Semua Ingatan RAG
                </button>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700/50 text-slate-300 hover:bg-slate-800 transition-all text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  onClick={saveByokKeys}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20 transition-all text-sm font-medium"
                >
                  Simpan Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RAG Knowledge Base Modal */}
      {isRagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-emerald-500/10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-500/20 bg-slate-800/50">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-emerald-400" />
                Knowledge Base (RAG)
              </h3>
              <button onClick={() => setIsRagModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-400 mb-6">
                Unggah dokumen (PDF, TXT) ke dalam Otak AI. Dokumen ini akan diingat secara permanen oleh Mamet untuk membantu menjawab pertanyaan Anda yang sangat spesifik.
              </p>

              <form onSubmit={handleRagUpload} className="space-y-4">
                <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-8 text-center transition-all bg-slate-950/50 relative">
                  <input 
                    type="file" 
                    accept=".pdf,.txt,.md"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) setRagFile(e.target.files[0]);
                    }}
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="w-8 h-8 text-slate-500" />
                    {ragFile ? (
                      <span className="text-emerald-400 font-medium">{ragFile.name}</span>
                    ) : (
                      <span className="text-slate-400 text-sm">Klik atau Seret file PDF/TXT ke sini</span>
                    )}
                  </div>
                </div>

                {ragStatus && (
                  <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-center text-emerald-300 font-mono">
                    {ragStatus}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={ragLoading || !ragFile}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold transition-all shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none"
                >
                  {ragLoading ? 'Mengekstrak Dokumen...' : 'Tanamkan ke Otak AI'}
                </button>
              </form>

              {knowledgeBase.length > 0 && (
                <div className="mt-8">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Dokumen Tersimpan:</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                    {knowledgeBase.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors group">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-sm text-slate-300 truncate" title={doc.title}>{doc.title}</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteRagDocument(doc.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-700/50 transition-all"
                          title="Hapus Dokumen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}