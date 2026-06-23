import TokenSaverAgent from './tokenSaverAgent.js';

class MainOrchestrator {
  constructor() {
    this.tokenSaver = new TokenSaverAgent();
  }

  /**
   * Eksekusi task dengan optimasi token
   * @param {Object} task - Task object dengan prompt dan context
   * @param {Function} apiCall - Fungsi untuk memanggil API
   * @returns {Promise<Object>} Result dari eksekusi task
   */
  async executeTask(task, apiCall) {
    // Cek budget terlebih dahulu
    const estimatedTokens = task.estimatedTokens || 1000;
    if (!this.tokenSaver.checkBudget(estimatedTokens)) {
      return {
        status: 'budget_exceeded',
        error: 'Token budget exceeded',
        stats: this.tokenSaver.getStats()
      };
    }

    // Optimasi task
    const strategy = this.tokenSaver.analyzeTask(task);
    // task.prompt = this.tokenSaver.optimizePrompt(task.prompt); // DISABLED FOR CAUSAL AUDIT

    // Eksekusi dengan batasan token
    try {
      const result = await apiCall(task, strategy);
      
      // Catat penggunaan
      const tokensUsed = result.tokens_used || estimatedTokens;
      this.tokenSaver.logUsage(tokensUsed);

      return {
        ...result,
        strategy: strategy,
        stats: this.tokenSaver.getStats()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        stats: this.tokenSaver.getStats()
      };
    }
  }

  /**
   * Eksekusi multiple task dengan batching
   * @param {Array<Object>} tasks - Array of task objects
   * @param {Function} apiCall - Fungsi untuk memanggil API
   * @returns {Promise<Array<Object>>} Results dari eksekusi tasks
   */
  async executeBatchTasks(tasks, apiCall) {
    const results = [];
    
    for (const task of tasks) {
      const result = await this.executeTask(task, apiCall);
      results.push(result);
      
      // Stop jika budget exceeded
      if (result.status === 'budget_exceeded') {
        break;
      }
    }

    return results;
  }

  /**
   * Get current token statistics
   * @returns {Object} Current stats
   */
  getStats() {
    return this.tokenSaver.getStats();
  }

  /**
   * Reset token usage
   */
  resetUsage() {
    this.tokenSaver.resetUsage();
  }

  /**
   * Configure token saver with custom settings
   * @param {Object} config - Configuration object
   */
  configure(config) {
    if (config.maxTokensPerTask) {
      this.tokenSaver.maxTokensPerTask = config.maxTokensPerTask;
    }
    if (config.budgetPerHour) {
      this.tokenSaver.budgetPerHour = config.budgetPerHour;
    }
  }
}

export default MainOrchestrator;
