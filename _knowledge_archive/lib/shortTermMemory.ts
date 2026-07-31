/**
 * Short Term Context Memory v1
 * Working memory buffer to preserve recent conversation context.
 * NO SUPABASE WRITES. Purely temporary session storage.
 */

export interface ShortTermMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  intent?: string;
}

export interface SessionBuffer {
  session_id: string;
  messages: ShortTermMessage[];
  summary?: string;
}

// In-memory stateless container for rapid session caching
const memoryStore = new Map<string, SessionBuffer>();

export function appendMessage(
  session_id: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  intent?: string
): SessionBuffer {
  if (!memoryStore.has(session_id)) {
    memoryStore.set(session_id, { session_id, messages: [] });
  }
  
  const buffer = memoryStore.get(session_id)!;
  
  buffer.messages.push({
    role,
    content,
    timestamp: Date.now(),
    intent
  });

  // Enforce max 10 messages (FIFO)
  if (buffer.messages.length > 10) {
    buffer.messages.shift(); // Remove oldest
  }

  // Phase 3: Lightweight Summarization (No LLM dependency)
  if (buffer.messages.length >= 10) {
    const topics = buffer.messages
      .filter(m => m.role === 'user')
      .map(m => m.intent && m.intent !== 'CHAT_BIASA' ? m.intent : 'general_chat')
      .slice(-3) // Observe the trend of the last 3 intents
      .join(' -> ');
      
    buffer.summary = `Session reached max buffer. Recent conversational flow: [${topics}]. Context size: ${buffer.messages.length} msgs.`;
  } else {
    // Drop summary if we dip below 10 or just keep it minimal
    buffer.summary = undefined;
  }

  return buffer;
}

export function getSessionBuffer(session_id: string): SessionBuffer {
  return memoryStore.get(session_id) || { session_id, messages: [] };
}

export function clearSession(session_id: string): void {
  memoryStore.delete(session_id);
}
