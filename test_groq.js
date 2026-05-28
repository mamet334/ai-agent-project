const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function test() {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'IDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet.' },
        { role: 'user', content: 'Siapa nama kamu?' }
      ]
    })
  });
  const data = await res.json();
  console.log(data.choices[0].message.content);
}
test();
