const url = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';
fetch(url, { headers: { 'Accept': 'application/openapi+json' } })
  .then(r => r.json())
  .then(d => {
    const table = d.definitions.user_memories;
    if (!table) return console.log('Table not found');
    for (const [col, info] of Object.entries(table.properties)) {
      console.log(col, ':', info.type, info.format || '');
    }
  })
  .catch(console.error);
