// simulate_runtime.js
const logs = [];
function consoleLog(...args) {
  logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
}

let callCount = 0;
let insertCount = 0;

async function processAndSaveMemory(message, context, userId) {
  callCount++;
  consoleLog("[MEMORY_CALL]", {
    time: 1234567890,
    message,
    stack: `Error\n    at processAndSaveMemory (index.js)\n    at serveHandler (index.js)`
  });
  
  // Regex check
  const memoryRegex = /(?:catatan riset|riset|project|tugas|deadline)/i;
  const isQuestion = message.includes('?');
  
  if (isQuestion) return;
  
  if (memoryRegex.test(message)) {
    consoleLog("[MEMORY_INSERT_ATTEMPT]", { userId, message, timestamp: 1234567890 });
    insertCount++;
    consoleLog("[MEMORY_INSERT_SUCCESS]");
  }
}

async function simulateRequest(stream) {
  const message = "Catatan riset: Binance memiliki volume derivatif terbesar di industri kripto";
  const userId = "user1";
  const tools = false;
  let replyMessage = "";
  
  // Simulate index.ts logic
  if (tools || !tools) {
    const isChatBiasa = true;
    if (isChatBiasa) {
      await processAndSaveMemory(message, "[Chat Biasa]", userId);
      if (stream) return; // But wait, in the real code it's `if (stream && !extractedImage) return streamRes;`
      // If stream = false, it does NOT return here!
      // In the user's desktop mode, stream is usually true or false?
      // Wait, even if stream is true, the `return` exits the `serve` function handler!
      // IF it exits the handler, how can it execute the `else` block later?
      // Wait, `if (streamRes) return streamRes;` EXITS THE ENTIRE FUNCTION!
      // Let's check `agent-process/index.ts`.
    }
  }
}
