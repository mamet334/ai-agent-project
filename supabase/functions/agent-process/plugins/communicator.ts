export default {
  name: 'communicator',
  description: 'Gunakan tool ini JIKA pengguna meminta untuk memanggil REST API, Webhook (Make/Zapier), Discord Webhook, Telegram API, Slack, atau melakukan HTTP Request (GET/POST/PUT) ke dunia luar.',
  execute: async ({ task, runLLM }) => {
    try {
      const prompt = `Tugas Anda: Buatkan konfigurasi HTTP Request berdasarkan permintaan user berikut.
Tugas dari user: "${task}"

KEMBALIKAN HANYA JSON MURNI TANPA MARKDOWN \`\`\`json. Format JSON harus seperti ini:
{
  "url": "https://api.example.com",
  "method": "POST",
  "headers": { "Content-Type": "application/json" },
  "body": "{\\"pesan\\":\\"halo\\"}" // jadikan string atau kosongkan jika GET
}`;

      const responseText = await runLLM(prompt, "Anda adalah API Constructor. Hanya kembalikan JSON murni.");
      let config;
      
      try {
        config = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
        return { output: "Gagal mem-parsing parameter API dari LLM." };
      }

      const { url, method, headers, body } = config;

      if (!url || !url.startsWith('http')) {
        return { output: "URL tidak valid atau tidak diberikan." };
      }

      const fetchOptions: any = {
        method: method || 'GET',
        headers: headers || {}
      };

      if (body && method !== 'GET') {
        fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
      }

      const res = await fetch(url, fetchOptions);
      const resText = await res.text();

      return {
        output: `Aksi Komunikasi (API Call) Berhasil!\nStatus: ${res.status}\nRespons: ${resText.substring(0, 500)}`,
        toolExecution: { name: 'make_api_call', args: { method, url, body: fetchOptions.body } }
      };

    } catch (err) {
      return { output: `Gagal melakukan pemanggilan API: ${err}` };
    }
  }
};
