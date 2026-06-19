const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/src/components/AIAgent.jsx');
let code = fs.readFileSync(filePath, 'utf8');

const target1 = `      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server responded with an error');
      }`;

const replacement1 = `      // Defensive patch for Orchestrator responses
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
      
      console.log('[FETCH_RESPONSE_OK]');`;

code = code.replace(target1, replacement1);

// The second place `response.json()` is called is around line 1656
// "const data = await response.json();"
// Actually, with the above check `typeof response.json !== 'function'`, we'll already return early if it's invalid!
// So line 1656 is already protected by the early returns above.

fs.writeFileSync(filePath, code);
console.log('AIAgent.jsx patched successfully!');
