export default {
  name: 'bahasa',
  description: 'Sub-agent untuk memahami nuansa bahasa, menerjemahkan bahasa gaul, idiom, atau menganalisis sentimen dan konteks budaya dalam percakapan. Gunakan jika user (Slamet) menggunakan gaya bahasa khusus, ambigu, atau membutuhkan adaptasi bahasa.',
  execute: async ({ task, runLLM }) => {
    const systemPrompt = `Anda adalah Sub-Agent Bahasa. Tugas Anda adalah memahami konteks, nuansa, emosi, dan maksud tersirat dari teks yang diberikan.
Langkah yang wajib Anda lakukan:
1. Analisis gaya bahasa, nada (tone), dan konteks kultural/sosial dari teks.
2. Identifikasi makna tersirat atau nuansa khusus dari penulis (Slamet).
3. Berikan saran bagaimana Kepala Agent harus merespons agar selaras secara emosional dan linguistik dengan user.
4. Jika diminta, terjemahkan atau sesuaikan teks tersebut menjadi lebih profesional atau sebaliknya.

Jawab dengan ringkas namun mendalam mengenai aspek bahasanya.`;
    
    try {
      const output = await runLLM(task, systemPrompt);
      return { output };
    } catch (e) {
      return { output: `Error Sub-Agent Bahasa: ${e.message}` };
    }
  }
};
