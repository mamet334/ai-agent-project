const fetch = require('node-fetch');

(async () => {
  const res = await fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ'
    },
    body: JSON.stringify({
      message: "Ucapkan 'Halo, saya Mamet dari otak Gemini 3.1 Pro' jika kamu berhasil jalan.",
      tools: [],
      history: [],
      model: "gemini-2.5-pro"
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
})();
