// mock.ts
import { Buffer } from "node:buffer";
const mockReq = {
  method: 'POST',
  headers: new Map([
    ['origin', 'http://localhost'],
    ['authorization', 'Bearer fake-token']
  ]),
  json: async () => ({
    message: "Catatan riset: Binance memiliki volume derivatif terbesar di industri kripto",
    userId: "test-user-123",
    tools: false,
    history: []
  })
};

// Mock Deno and createClient before importing index.ts
globalThis.Deno = {
  env: {
    get: (key) => 'fake'
  }
};
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({}),
  text: async () => ""
});

let handler = null;
const mockServe = (fn) => {
  handler = fn;
};

// Override the std server module 
// Wait, we can't easily override Deno imports in Node. We must run this using Deno!
