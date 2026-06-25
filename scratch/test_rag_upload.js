const url = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/rag-process';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

async function testUpload() {
  console.log("Menjalankan simulasi upload RAG...");
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'test_dokumen_audit.txt',
        text: 'Ini adalah dokumen uji coba untuk forensik auditor.',
        userId: '00000000-0000-0000-0000-000000000000'
      })
    });
    
    const status = res.status;
    const body = await res.text();
    
    console.log("HTTP Status:", status);
    console.log("Response Body:", body);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testUpload();
