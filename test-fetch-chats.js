const fetch = require('node-fetch');

(async () => {
  const supabaseUrl = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

  const res = await fetch(`${supabaseUrl}/rest/v1/chats?select=*&order=created_at.desc&limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    }
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
})();
