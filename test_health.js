fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/health-check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}).then(async res => {
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}).catch(console.error);
