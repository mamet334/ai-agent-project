const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("=== AUDIT KNOWLEDGE SPACES ===");
  const { data: spaces, error: spaceErr } = await supabase.from('knowledge_spaces').select('*');
  if (spaceErr) {
    console.error("Error fetching spaces:", spaceErr);
    return;
  }

  console.log(`Jumlah total row knowledge_spaces: ${spaces.length}`);
  console.log("\nSeluruh workspace milik user (dalam DB):");
  spaces.forEach(s => console.log(` - [${s.space_type}] ${s.name} (ID: ${s.id})`));

  const targetSpace = spaces.find(s => s.name.toLowerCase().includes('observasi pasar freelance') || s.name.toLowerCase().includes('observasi pasar'));
  
  if (!targetSpace) {
      console.log("\n[KESIMPULAN] Workspace 'Observasi Pasar Freelance' TIDAK DITEMUKAN.");
      
      const { data: allDocs } = await supabase.from('documents').select('title, space_id').ilike('title', '%observasi%');
      console.log(`Mencari dokumen observasi di workspace manapun: ${allDocs?.length || 0} ditemukan.`);
      console.log(allDocs);
      return;
  }

  console.log(`\n=== DETAIL WORKSPACE TARGET ===`);
  console.log(`Nama: ${targetSpace.name}`);
  console.log(`Space ID: ${targetSpace.id}`);

  const { data: docs, error: docErr } = await supabase.from('documents').select('*').eq('space_id', targetSpace.id);
  if (docErr) {
    console.error("Error fetching docs:", docErr);
    return;
  }

  console.log(`\nJumlah row pada tabel documents (Aktual): ${docs.length}`);
  console.log("Daftar Judul Dokumen:");
  docs.forEach(d => console.log(` - ${d.title} (ID: ${d.id})`));

  if (docs.length > 0) {
      const docIds = docs.map(d => d.id);
      const { count, error: chunkErr } = await supabase.from('document_chunks').select('id', { count: 'exact' }).in('document_id', docIds);
      if (chunkErr) console.error("Error fetching chunk count:", chunkErr);
      else console.log(`\nJumlah row document_chunks terkait (Aktual): ${count}`);
  } else {
      console.log(`\nJumlah row document_chunks terkait (Aktual): 0`);
  }
  
  console.log(`\n=== PEMERIKSAAN ANOMALI ===`);
  const { data: otherDocs } = await supabase.from('documents').select('title, space_id').neq('space_id', targetSpace.id).ilike('title', '%observasi%');
  console.log(`Dokumen dengan kata "observasi" yang tersimpan di workspace LAIN: ${otherDocs?.length || 0}`);
  if (otherDocs && otherDocs.length > 0) {
      otherDocs.forEach(od => console.log(` - ${od.title} (Berada di Space ID: ${od.space_id})`));
  }
  
  const similarSpaces = spaces.filter(s => s.name.toLowerCase().includes('observasi') && s.id !== targetSpace.id);
  if (similarSpaces.length > 0) {
      console.log(`\nDUPLIKASI/MIRIP WORKSPACE DITEMUKAN:`);
      similarSpaces.forEach(s => console.log(` - [${s.space_type}] ${s.name} (ID: ${s.id})`));
  } else {
      console.log(`\nTidak ada duplikasi workspace dengan nama mirip.`);
  }
}

run().catch(console.error);
