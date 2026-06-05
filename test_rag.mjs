import fetch from 'node-fetch';

async function testRag() {
  console.log("Testing rag-process...");
  const res = await fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/rag-process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'test_doc.txt',
      text: 'Ini adalah kalimat rahasia tentang T.U.C.E framework. T.U.C.E singkatan dari Think, Use, Check, Enhance. Jangan lupa!',
      userId: '00000000-0000-0000-0000-000000000000'
    })
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}

testRag();
