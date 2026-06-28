// Benchmark untuk mengukur latency Stream Interceptor vs Full Buffer
const { performance } = require('perf_hooks');

// Simulasi 1000 chunk dari LLM
const chunks = [];
const words = ["ini ", "adalah ", "chunk ", "dari ", "llm ", "yang ", "sedang ", "berhalusinasi ", "dan ", "memalsukan ", "source ", "trace ", "ADR-0005 "];
for (let i = 0; i < 1000; i++) {
    chunks.push(words[i % words.length]);
}

console.log("=== BENCHMARK 1: REGEX INTERCEPTOR (ALTERNATIF C) ===");
let totalLatency = 0;
const forbiddenRegex = /halusinasi|palsu|rahasia|password/i;

// Mengukur waktu validasi per chunk
const startRegex = performance.now();
for (let chunk of chunks) {
    // Regex test pada setiap chunk
    const isViolation = forbiddenRegex.test(chunk);
}
const endRegex = performance.now();
const diffRegex = endRegex - startRegex;
console.log(`Waktu proses Regex untuk 1000 chunks: ${diffRegex.toFixed(4)} ms`);
console.log(`Rata-rata overhead per chunk: ${(diffRegex / 1000).toFixed(6)} ms`);
if ((diffRegex / 1000) < 50) {
    console.log("KLAIM 5 DIBANTAH: Overhead jauh di bawah 50ms per chunk.\n");
}

console.log("=== BENCHMARK 2: FULL BUFFER ALLOCATION (ALTERNATIF A) ===");
// Mengukur overhead untuk buffer concatenation vs stream langsung
const startBuffer = performance.now();
let fullString = "";
for (let chunk of chunks) {
    fullString += chunk;
}
const endBuffer = performance.now();
const diffBuffer = endBuffer - startBuffer;
console.log(`Waktu buffer string 1000 chunks (panjang ${fullString.length} char): ${diffBuffer.toFixed(4)} ms`);
console.log("Catatan: Angka ini hanya CPU string allocation. TTFB delay asli pada Alternatif A didominasi oleh waktu generasi LLM (network/GPU LLM), BUKAN alokasi backend.\n");
