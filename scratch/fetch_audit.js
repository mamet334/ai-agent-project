fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/test-audit')
  .then(r => r.json())
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(console.error);
