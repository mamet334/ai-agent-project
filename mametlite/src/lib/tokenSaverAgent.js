class TokenSaverAgent {
  /**
   * Sub-agent untuk mengoptimalkan penggunaan token API
   * @param {number} maxTokensPerTask - Maksimum token per tugas (default: 500)
   * @param {number} budgetPerHour - Budget token per jam (default: 5000)
   */
  constructor(maxTokensPerTask = 500, budgetPerHour = 5000) {
    this.maxTokensPerTask = maxTokensPerTask;
    this.budgetPerHour = budgetPerHour;
    this.usedTokens = 0;
    this.taskQueue = [];
  }

  /**
   * Analisis task dan tentukan strategi penghematan
   * @param {Object} task - Task object
   * @returns {Object} Strategy object
   */
  analyzeTask(task) {
    const complexity = this._estimateComplexity(task);
    
    const strategy = {
      use_cache: task.repeatable || false,
      summarize_context: complexity > 0.7,
      batch_requests: this.taskQueue.length > 3,
      use_templates: true,
      compress_prompts: true,
      max_tokens: this._calculateOptimalTokens(complexity)
    };
    
    return strategy;
  }

  /**
   * Kompresi prompt tanpa menghilangkan esensi
   * @param {string} prompt - Original prompt
   * @returns {string} Optimized prompt
   */
  optimizePrompt(prompt) {
    let optimized = prompt;
    
    optimized = this._removeRedundancy(optimized);
    optimized = this._useAbbreviations(optimized);
    optimized = this._compressExamples(optimized);
    
    return optimized;
  }

  /**
   * Cek apakah masih dalam budget
   * @param {number} estimatedTokens - Estimated tokens needed
   * @returns {boolean} True if within budget
   */
  checkBudget(estimatedTokens) {
    return (this.usedTokens + estimatedTokens) <= this.budgetPerHour;
  }

  /**
   * Estimasi kompleksitas task (0-1)
   * @param {Object} task - Task object
   * @returns {number} Complexity score
   */
  _estimateComplexity(task) {
    let contextStr = '';
    if (typeof task.context === 'string') {
      contextStr = task.context;
    } else if (Array.isArray(task.context)) {
      contextStr = task.context.map(msg => typeof msg === 'object' ? (msg.content || '') : String(msg)).join(' ');
    } else {
      contextStr = String(task.context || '');
    }
    
    const factors = contextStr.split(/\s+/).length;
    return Math.min(factors / 1000, 1.0);
  }

  /**
   * Hitung token optimal berdasarkan kompleksitas
   * @param {number} complexity - Complexity score
   * @returns {number} Optimal token count
   */
  _calculateOptimalTokens(complexity) {
    const base = 200;
    return Math.floor(base + (complexity * 300));
  }

  /**
   * Hapus teks redundan
   * @param {string} text - Input text
   * @returns {string} Text without redundancy
   */
  _removeRedundancy(text) {
    // Pastikan text adalah string sebelum split
    const textStr = String(text || '');
    const words = textStr.split(' ');
    const uniqueWords = [...new Set(words)];
    return uniqueWords.join(' ');
  }

  /**
   * Ganti kata panjang dengan singkatan
   * @param {string} text - Input text
   * @returns {string} Text with abbreviations
   */
  _useAbbreviations(text) {
    const replacements = {
      'silahkan': 'slh',
      'informasi': 'info',
      'terima kasih': 'tq'
    };
    
    let result = text;
    for (const [long, short] of Object.entries(replacements)) {
      result = result.replace(new RegExp(long, 'gi'), short);
    }
    
    return result;
  }

  /**
   * Kompresi contoh panjang
   * @param {string} text - Input text
   * @returns {string} Compressed text
   */
  _compressExamples(text) {
    const halfLength = Math.floor(text.length / 2);
    return text.slice(0, halfLength) + '...';
  }

  /**
   * Catat penggunaan token
   * @param {number} tokensUsed - Tokens used
   */
  logUsage(tokensUsed) {
    this.usedTokens += tokensUsed;
    console.log(`📊 Token: ${this.usedTokens}/${this.budgetPerHour}`);
  }

  /**
   * Reset token usage (for new hour/session)
   */
  resetUsage() {
    this.usedTokens = 0;
  }

  /**
   * Get current usage statistics
   * @returns {Object} Usage stats
   */
  getStats() {
    return {
      used: this.usedTokens,
      budget: this.budgetPerHour,
      remaining: this.budgetPerHour - this.usedTokens,
      percentage: ((this.usedTokens / this.budgetPerHour) * 100).toFixed(2)
    };
  }
}

export default TokenSaverAgent;
