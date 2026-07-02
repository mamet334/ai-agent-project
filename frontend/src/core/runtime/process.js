// process.js
export class ProcessManager {
  constructor(bus) {
    this.bus = bus;
    this.tasks = new Map();
    this.defaultTimeoutMs = 15000; // 15 detik timeout untuk mencegah blocking
    this.bus.on('process.execute', this.execute.bind(this));
  }

  // Eksekusi fungsi dengan pengamanan try-catch dan race timeout
  async execute(taskName, fn, ...args) {
    // 1. Emit Process:Start
    this.bus.emit('Process:Start', { taskName, timestamp: Date.now() });

    try {
      // 2. Siapkan Timeout Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Process timeout: Task '${taskName}' melebihi batas waktu ${this.defaultTimeoutMs}ms`));
        }, this.defaultTimeoutMs);
      });

      // 3. Bungkus eksekusi fungsi dalam Promise agar selalu asinkron
      const executionPromise = (async () => {
        return await fn(...args);
      })();

      // 4. Lakukan Race antara eksekusi aktual vs timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // 5. Emit Process:Complete
      this.bus.emit('Process:Complete', { taskName, result, timestamp: Date.now() });
      return result;
    } catch (error) {
      // 6. Emit Process:Error jika terjadi exception atau timeout
      this.bus.emit('Process:Error', { taskName, error: error.message || error, timestamp: Date.now() });
      throw error; // Tetap throw error agar caller bisa handle jika diperlukan
    }
  }
}