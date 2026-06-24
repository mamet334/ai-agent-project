export async function evaluateKnowledgeQuality(
  text: string, 
  groqApiKey: string,
  isEnabled: boolean = true
): Promise<{ status: 'APPROVED' | 'REJECTED', reason: string }> {
  if (!isEnabled) {
    return { status: 'APPROVED', reason: 'Quality filter disabled.' };
  }

  // Jika terlalu pendek (< 50 karakter), langsung tolak tanpa API call
  if (text.length < 50) return { status: 'REJECTED', reason: 'Teks terlalu pendek atau tidak memiliki konteks berharga.' };
  
  if (!groqApiKey) {
     // Jika tidak ada Groq Key, kita fallback ke rule-based sederhana
     const words = text.split(/\s+/).length;
     if (words > 20) return { status: 'APPROVED', reason: 'Panjang teks memadai (Fallback rule).' };
     return { status: 'REJECTED', reason: 'Groq API Key tidak ada, rule-based menolak.' };
  }

  const systemPrompt = `Anda adalah filter Kualitas Knowledge Base (RAG Guardrail).
Tugas: Tentukan apakah teks berikut bernilai (APPROVED) atau hanya noise/sapaan/obrolan pendek (REJECTED).
Filter WAJIB menolak: sapaan, percakapan santai, chat pendek, spam, instruksi sementara, output tanpa nilai pengetahuan.
Filter WAJIB menerima: hasil riset, dokumentasi, observasi pasar, knowledge terstruktur, hasil analisis, SOP, arsip kerja.

Format WAJIB JSON persis seperti ini (tanpa markdown):
{"status": "APPROVED" | "REJECTED", "reason": "alasan singkat"}`;
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
       console.warn("Groq Filter API Error", response.status);
       return { status: 'APPROVED', reason: 'Groq API error, fallback to approved' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return { 
      status: parsed.status === 'APPROVED' ? 'APPROVED' : 'REJECTED', 
      reason: parsed.reason || 'Sesuai keputusan AI filter.' 
    };
  } catch (error: any) {
    console.error("Knowledge Quality Filter Error:", error);
    return { status: 'APPROVED', reason: 'Filter gagal (error), fallback to approved.' };
  }
}
