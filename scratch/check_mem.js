import 'dotenv/config';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function checkMemories() {
  const res = await fetch(`${url}/rest/v1/user_memories?select=summary,user_id`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  
  if (!res.ok) {
    console.error("Error:", await res.text());
    return;
  }
  
  const data = await res.json();
  console.log("MEMORIES:", data);
}

checkMemories();
