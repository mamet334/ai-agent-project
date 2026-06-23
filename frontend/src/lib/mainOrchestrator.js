import TokenSaverAgent from './tokenSaverAgent.js';

class MainOrchestrator {
  constructor() {
    this.tokenSaver = new TokenSaverAgent();
  }

  async executeTask(task, apiCall) {
    // ✅ VALIDASI: Pastikan task dan prompt ada
    if (!task || typeof task.prompt !== 'string') {
      console.warn('[Orchestrator] Task/prompt tidak valid, pakai fallback', task);
      try {
        const response = await apiCall(task || { prompt: '' }, {});
        response.strategy = { complexity: 'low', action: 'direct' };
        response.stats = this.tokenSaver.getStats();
        return response;
      } catch (err) {
        return {
          status: 'error',
          error: err.message,
          stats: this.tokenSaver.getStats()
        };
      }
    }

    // Cek budget
    const estimatedTokens = task.estimatedTokens || 1000;
    if (!this.tokenSaver.checkBudget(estimatedTokens)) {
      return {
        status: 'budget_exceeded',
        error: 'Token budget exceeded',
        stats: this.tokenSaver.getStats()
      };
    }

    // ✅ AMANKAN panggilan ke tokenSaver (error dari analyzeTask/optimizePrompt tidak akan crash)
    let strategy = { complexity: 'low', action: 'direct' };
    let optimizedPrompt = task.prompt;

    try {
      strategy = this.tokenSaver.analyzeTask(task);
      // optimizedPrompt = this.tokenSaver.optimizePrompt(task.prompt); // DISABLED FOR CAUSAL AUDIT
    } catch (err) {
      console.warn('[Orchestrator] TokenSaver error, pakai default', err);
      // tetap pakai prompt asli dan strategy default
    }

    // Buat task baru dengan prompt yang sudah dioptimasi (atau asli jika error)
    const safeTask = { ...task, prompt: optimizedPrompt };

    // Eksekusi API
    try {
      const result = await apiCall(safeTask, strategy);
      // Catat penggunaan token (diamankan)
      try {
        const tokensUsed = result.tokens_used || estimatedTokens;
        this.tokenSaver.logUsage(tokensUsed);
      } catch (e) {}
      
      // Return Response object directly with attached metadata
      result.strategy = strategy;
      result.stats = this.tokenSaver.getStats();
      return result;
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        stats: this.tokenSaver.getStats()
      };
    }
  }

  async executeBatchTasks(tasks, apiCall) {
    const results = [];
    for (const task of tasks) {
      const result = await this.executeTask(task, apiCall);
      results.push(result);
      if (result.status === 'budget_exceeded') break;
    }
    return results;
  }

  getStats() {
    return this.tokenSaver.getStats();
  }

  resetUsage() {
    this.tokenSaver.resetUsage();
  }

  configure(config) {
    if (config.maxTokensPerTask) this.tokenSaver.maxTokensPerTask = config.maxTokensPerTask;
    if (config.budgetPerHour) this.tokenSaver.budgetPerHour = config.budgetPerHour;
  }
}

export default MainOrchestrator;