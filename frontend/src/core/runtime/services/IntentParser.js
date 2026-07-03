/**
 * IntentParser - Parser untuk mendeteksi intent dari pesan user
 * Menggunakan pendekatan rule-based sederhana untuk klasifikasi intent.
 */

export class IntentParser {
  constructor() {
    this.intents = {
      QUESTION: ['apa', 'siapa', 'bagaimana', 'kapan', 'dimana', 'mengapa', 'kenapa', 'berapa', 'adakah'],
      COMMAND: ['buka', 'jalankan', 'cari', 'buat', 'hapus', 'tampilkan', 'simpan', 'kirim', 'unduh', 'tutup'],
      STORE: ['ingat', 'simpan', 'catat', 'tolong ingat', 'jangan lupa'],
      GREETING: ['hai', 'halo', 'selamat', 'hello', 'hi', 'pagi', 'siang', 'sore', 'malam'],
      SCHEDULE: ['besok', 'nanti', 'jadwal', 'agenda', 'rapat', 'meeting'],
      PREFERENCE_ASK: ['apa kesukaan', 'apa favorit', 'apa yang disukai', 'apa minuman', 'apa makanan'],
      FAREWELL: ['dadah', 'sampai jumpa', 'bye', 'selamat tinggal']
    };
  }

  /**
   * Parse intent dari pesan
   * @param {string} message - Pesan dari user
   * @returns {Object} { intent, confidence }
   */
  parse(message) {
    if (!message || typeof message !== 'string') {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    const messageLower = message.toLowerCase();
    let bestMatch = { intent: 'UNKNOWN', confidence: 0 };

    // Cek setiap intent
    for (const [intent, keywords] of Object.entries(this.intents)) {
      let matchCount = 0;
      let totalKeywords = keywords.length;

      for (const keyword of keywords) {
        if (messageLower.includes(keyword)) {
          matchCount++;
        }
      }

      // Hitung confidence berdasarkan jumlah keyword yang cocok
      if (matchCount > 0) {
        const confidence = matchCount / totalKeywords;
        if (confidence > bestMatch.confidence) {
          bestMatch = { intent, confidence };
        }
      }
    }

    // Boost confidence untuk greeting jika di awal pesan
    if (bestMatch.intent === 'GREETING') {
      const firstWord = messageLower.split(' ')[0];
      if (this.intents.GREETING.includes(firstWord)) {
        bestMatch.confidence = Math.min(1, bestMatch.confidence + 0.3);
      }
    }

    return bestMatch;
  }

  /**
   * Cek apakah pesan adalah pertanyaan
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isQuestion(message) {
    return this.parse(message).intent === 'QUESTION';
  }

  /**
   * Cek apakah pesan adalah perintah
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isCommand(message) {
    return this.parse(message).intent === 'COMMAND';
  }

  /**
   * Cek apakah pesan adalah request untuk menyimpan
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isStoreRequest(message) {
    return this.parse(message).intent === 'STORE';
  }

  /**
   * Cek apakah pesan adalah sapaan
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isGreeting(message) {
    return this.parse(message).intent === 'GREETING';
  }

  /**
   * Cek apakah pesan berkaitan dengan jadwal/waktu
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isSchedule(message) {
    return this.parse(message).intent === 'SCHEDULE';
  }

  /**
   * Cek apakah pesan adalah pertanyaan tentang preferensi
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isPreferenceAsk(message) {
    return this.parse(message).intent === 'PREFERENCE_ASK';
  }

  /**
   * Cek apakah pesan adalah ucapan perpisahan
   * @param {string} message - Pesan dari user
   * @returns {boolean}
   */
  isFarewell(message) {
    return this.parse(message).intent === 'FAREWELL';
  }
}