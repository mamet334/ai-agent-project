const OPENROUTER_API_KEY = "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";

async function run() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      }
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch(e) {
    console.log("Failed:", e.message);
  }
}
run();
