/**
 * EntityExtractor - Ekstrakor untuk mendeteksi entity dari pesan user
 * Menggunakan pola regex sederhana untuk ekstraksi entity.
 */

export class EntityExtractor {
  constructor() {
    this.patterns = [
      {
        type: 'NAME',
        patterns: [
          /nama saya adalah\s+([a-zA-Z\s]+)/i,
          /panggil saya\s+([a-zA-Z\s]+)/i,
          /saya\s+(?:disebut|dipanggil)\s+([a-zA-Z\s]+)/i,
          /namaku\s+([a-zA-Z\s]+)/i
        ]
      },
      {
        type: 'JOB',
        patterns: [
          /saya bekerja sebagai\s+([a-zA-Z\s]+)/i,
          /saya seorang\s+([a-zA-Z\s]+)/i,
          /pekerjaan saya\s+(?:adalah|sebagai)\s+([a-zA-Z\s]+)/i,
          /profesi saya\s+(?:adalah|sebagai)\s+([a-zA-Z\s]+)/i
        ]
      },
      {
        type: 'PREFERENCE',
        patterns: [
          /saya suka\s+([a-zA-Z\s]+)/i,
          /saya tidak suka\s+([a-zA-Z\s]+)/i,
          /kesukaan saya\s+(?:adalah|adalah)\s+([a-zA-Z\s]+)/i,
          /saya lebih suka\s+([a-zA-Z\s]+)/i,
          /saya benci\s+([a-zA-Z\s]+)/i
        ]
      },
      {
        type: 'LOCATION',
        patterns: [
          /saya tinggal di\s+([a-zA-Z\s]+)/i,
          /saya berdomisili di\s+([a-zA-Z\s]+)/i,
          /alamat saya\s+(?:adalah|di)\s+([a-zA-Z\s]+)/i,
          /saya berasal dari\s+([a-zA-Z\s]+)/i
        ]
      },
      {
        type: 'AGE',
        patterns: [
          /umur saya\s+(?:adalah|)\s*(\d+)\s*tahun/i,
          /saya berusia\s+(\d+)\s*tahun/i,
          /usia saya\s+(?:adalah|)\s*(\d+)/i
        ]
      },
      {
        type: 'BIRTHDATE',
        patterns: [
          /tanggal lahir saya\s+(?:adalah|)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i,
          /saya lahir pada\s+(?:tanggal|)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i
        ]
      },
      {
        type: 'EMAIL',
        patterns: [
          /email saya\s+(?:adalah|)\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
        ]
      },
      {
        type: 'PHONE',
        patterns: [
          /nomor telepon saya\s+(?:adalah|)\s*(\+?[\d\s-]+)/i,
          /no hp saya\s+(?:adalah|)\s*(\+?[\d\s-]+)/i,
          /whatsapp saya\s+(?:adalah|)\s*(\+?[\d\s-]+)/i
        ]
      }
    ];
  }

  /**
   * Ekstrak entity dari pesan
   * @param {string} message - Pesan dari user
   * @returns {Array} Array of entities
   */
  extract(message) {
    if (!message || typeof message !== 'string') {
      return [];
    }

    const entities = [];
    const messageLower = message.toLowerCase();

    // Cek setiap pattern
    for (const patternGroup of this.patterns) {
      for (const pattern of patternGroup.patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          const value = match[1].trim();
          
          // Cek duplikasi
          const isDuplicate = entities.some(e => 
            e.type === patternGroup.type && e.value.toLowerCase() === value.toLowerCase()
          );

          if (!isDuplicate) {
            entities.push({
              type: patternGroup.type,
              value: value,
              confidence: this._calculateConfidence(patternGroup.type, messageLower)
            });
          }
        }
      }
    }

    return entities;
  }

  /**
   * Hitung confidence berdasarkan tipe entity dan konteks pesan
   * @private
   */
  _calculateConfidence(type, messageLower) {
    let baseConfidence = 0.7;

    // Boost confidence untuk entity tertentu
    if (type === 'NAME' || type === 'EMAIL' || type === 'PHONE') {
      baseConfidence = 0.9;
    } else if (type === 'JOB' || type === 'LOCATION') {
      baseConfidence = 0.8;
    }

    // Boost jika ada kata "adalah" atau "sebagai" di dekat entity
    if (messageLower.includes('adalah') || messageLower.includes('sebagai')) {
      baseConfidence = Math.min(1, baseConfidence + 0.1);
    }

    return baseConfidence;
  }

  /**
   * Ekstrak entity berdasarkan tipe spesifik
   * @param {string} message - Pesan dari user
   * @param {string} type - Tipe entity yang dicari
   * @returns {Array} Array of entities dengan tipe tersebut
   */
  extractByType(message, type) {
    const allEntities = this.extract(message);
    return allEntities.filter(entity => entity.type === type);
  }

  /**
   * Ekstrak nama dari pesan
   * @param {string} message - Pesan dari user
   * @returns {string|null} Nama yang diekstrak
   */
  extractName(message) {
    const names = this.extractByType(message, 'NAME');
    return names.length > 0 ? names[0].value : null;
  }

  /**
   * Ekstrak email dari pesan
   * @param {string} message - Pesan dari user
   * @returns {string|null} Email yang diekstrak
   */
  extractEmail(message) {
    const emails = this.extractByType(message, 'EMAIL');
    return emails.length > 0 ? emails[0].value : null;
  }

  /**
   * Ekstrak preferensi dari pesan
   * @param {string} message - Pesan dari user
   * @returns {Array} Array of preferensi
   */
  extractPreferences(message) {
    return this.extractByType(message, 'PREFERENCE');
  }
}
