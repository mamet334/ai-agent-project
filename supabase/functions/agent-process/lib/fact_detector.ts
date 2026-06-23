export interface IntentResult {
  shouldSaveMemory: boolean;
  reason: string;
  intent: 'FACT' | 'QUESTION' | 'TASK' | 'CHAT';
  confidence: number;
}

/**
 * Lightweight Deterministic Classifier
 * Membedakan antara FACT, QUESTION, TASK, dan CHAT dalam < 1ms.
 */
export function detectFact(text: string): IntentResult {
  const lowerText = text.trim().toLowerCase();

  // -------------------------------------------------------------
  // 1. FAST FAIL: CHAT (Filter struktur terlalu pendek)
  // -------------------------------------------------------------
  const wordCount = lowerText.split(/\s+/).length;
  if (wordCount < 3 && !lowerText.includes('nama')) {
    return { shouldSaveMemory: false, reason: '< 3 kata (Small Talk)', intent: 'CHAT', confidence: 0.9 };
  }

  const greetingWords = ['halo', 'hai', 'hello', 'selamat', 'pagi', 'siang', 'sore', 'malam', 'bro', 'min', 'bot', 'mamet'];
  if (greetingWords.some(w => lowerText === w || lowerText.startsWith(w + ' '))) {
    return { shouldSaveMemory: false, reason: 'Greeting / Small Talk', intent: 'CHAT', confidence: 0.95 };
  }

  // -------------------------------------------------------------
  // 2. FAST FAIL: QUESTION (Tidak boleh menyimpan pertanyaan)
  // -------------------------------------------------------------
  if (lowerText.includes('?')) {
    return { shouldSaveMemory: false, reason: 'Mengandung tanda tanya (?)', intent: 'QUESTION', confidence: 1.0 };
  }

  const questionWords = ['apa', 'siapa', 'kapan', 'dimana', 'di mana', 'kenapa', 'mengapa', 'bagaimana', 'gimana', 'berap', 'apakah'];
  if (questionWords.some(w => lowerText.includes(w))) {
    return { shouldSaveMemory: false, reason: 'Mengandung kata tanya', intent: 'QUESTION', confidence: 0.85 };
  }

  // -------------------------------------------------------------
  // 3. FAST FAIL: TASK (Permintaan, perintah, troubleshooting)
  // -------------------------------------------------------------
  const taskWords = ['buatkan', 'tolong', 'jelaskan', 'cari', 'generate', 'analisis', 'bantu', 'tuliskan', 'error', 'bug', 'gagal', 'coba', 'test', 'tes', 'ubah', 'hapus', 'edit', 'lihat', 'cek'];
  if (taskWords.some(w => lowerText.startsWith(w) || lowerText.includes(' ' + w + ' '))) {
    return { shouldSaveMemory: false, reason: 'Command / Task Request', intent: 'TASK', confidence: 0.9 };
  }

  // -------------------------------------------------------------
  // 4. FACT VALIDATION (Strict Match Rules)
  // -------------------------------------------------------------
  const factPatterns = [
    /^(nama saya|panggil saya|namaku) (.+)$/,
    /^(saya|aku) (adalah|seorang) (.+)$/,
    /^(saya|aku) suka (.+)$/,
    /^(saya|aku) (tidak suka|benci|alergi) (.+)$/,
    /^(saya|aku) (tinggal|domisili) di (.+)$/,
    /^(saya|aku) bekerja (sebagai|di) (.+)$/,
    /^(saya|aku) punya (.+)$/,
    /^(umur|usia) saya (.+)$/,
    /^(saya|aku) lahir (di|pada) (.+)$/,
    /^(ingat bahwa|pastikan kamu ingat|catat bahwa) (.+)$/
  ];

  for (const pattern of factPatterns) {
    if (pattern.test(lowerText)) {
      return { 
        shouldSaveMemory: true, 
        reason: 'Cocok dengan Strict Fact Pattern', 
        intent: 'FACT', 
        confidence: 0.9 
      };
    }
  }

  // -------------------------------------------------------------
  // 5. DEFAULT FALLBACK: REJECT (Prinsip: Lebih baik Miss 1 Fact)
  // -------------------------------------------------------------
  return { 
    shouldSaveMemory: false, 
    reason: 'Tidak terdeteksi sebagai Factual Self-Disclosure', 
    intent: 'CHAT', 
    confidence: 0.5 
  };
}
