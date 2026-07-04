const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Pastikan ada space yang dipilih
    let targetSpace = selectedSpace;
    if (!targetSpace) {
        // Coba buat default space
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data: newSpace, error: spaceError } = await supabase
                .from('knowledge_spaces')
                .insert({
                    user_id: session.user.id,
                    name: 'Default Workspace',
                    description: 'Auto-created default workspace',
                    space_type: 'WORKSPACE'
                })
                .select('id')
                .single();

            if (spaceError) throw spaceError;
            targetSpace = newSpace.id;
            setSelectedSpace(targetSpace);

            // Refresh daftar spaces
            loadSpaces();
        } catch (err) {
            console.error('[ResearchApp] Gagal membuat default space:', err);
            alert('Tidak ada knowledge space. Silakan buat space terlebih dahulu.');
            return;
        }
    }

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