const fetch = require('node-fetch');

(async () => {
  const supabaseUrl = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

  console.log("Hitting agent-process directly with ANON KEY...");
  const res = await fetch(`${supabaseUrl}/functions/v1/agent-process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({
      message: "Tugas Otomatis Test",
      tools: [],
      model: "gemini-2.5-flash",
      stream: false
    })
  });
  
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
})();
