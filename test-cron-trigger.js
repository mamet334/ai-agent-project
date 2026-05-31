const fetch = require('node-fetch');

(async () => {
  console.log("Triggering cron-agent...");
  const res = await fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/cron-agent', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ'
    }
  });
  
  if (!res.ok) {
    const errText = await res.text();
    console.log("Error from server:", res.status, errText);
    return;
  }
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
})();
