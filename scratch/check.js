const url = "https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ";

fetch(url, {
  method: "GET",
  headers: { apikey: key, Authorization: "Bearer " + key }
}).then(r => r.json()).then(console.log).catch(console.error);
