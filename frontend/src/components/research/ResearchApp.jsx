const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // GUNAKAN SPACE YANG SUDAH ADA (hardcoded ID dari database)
    const DEFAULT_SPACE_ID = '58dba6bd-293e-4a8e-8692-a38dd6f7c41b';
    
    // Jika selectedSpace belum di-set, gunakan default
    if (!selectedSpace) {
      setSelectedSpace(DEFAULT_SPACE_ID);
    }
    
    const targetSpace = selectedSpace || DEFAULT_SPACE_ID;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const text = await file.text();

      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: session.user.id,
          title: file.name,
          space_id: targetSpace
        })
        .select('id')
        .single();

      if (docError) throw docError;

      const { error: chunkError } = await supabase
        .from('document_chunks')
        .insert({
          document_id: doc.id,
          content: text.substring(0, 5000)
        });

      if (chunkError) throw chunkError;

      loadDocuments();
    } catch (err) {
      console.error('[ResearchApp] Gagal upload:', err);
      alert('Gagal mengunggah dokumen: ' + err.message);
    } finally {
      setUploading(false);
    }
  };