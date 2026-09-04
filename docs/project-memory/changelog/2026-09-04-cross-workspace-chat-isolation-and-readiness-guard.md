# Changelog: Cross-Workspace Chat History Isolation & Workspace Readiness Guard

**Tanggal:** 2026-09-04  
**Tipe:** Runtime Hardening, State Synchronization, Cross-Workspace Isolation & Race Condition Remediation  
**Scope:** `frontend/src/components/workbench/ChatHistory.jsx`, `frontend/src/components/workbench/ConversationEngine.jsx`, `docs/roadmap/INDEX-ROADMAP.md`, `docs/roadmap/ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md`  
**Author:** Antigravity (AI Engineering Partner) & Project Owner  
**Status:** ✅ Terverifikasi Penuh & Live-Accepted oleh Owner (Chat & Riwayat Terbukti Terisolasi Sempurna Antar Workspace)

---

## 1. Latar Belakang & Gejala Masalah

Setelah implementasi awal stabilisasi React Reconciler dan EventBus untuk `ChatHistory`, Owner menemukan inkonsistensi saat pengujian aplikasi desktop:
- Percakapan yang dilakukan pada **Workspace Assistant (`ws-assistant`)** ikut muncul di bilah riwayat obrolan **Workspace Engineer (`ws-engineer`)**.
- Riwayat chat tampak saling tercampur antar-workspace.

---

## 2. Akar Masalah (*Root Cause Analysis*)

Investigasi mendalam mengungkap sebuah **race condition** saat inisialisasi aplikasi:

1. **Sifat Asinkron `WorkspaceManager.switchWorkspace()`:**
   - Saat aplikasi pertama kali dimuat di DOM, `osState?.workspaceId` masih berstatus `undefined` karena `switchWorkspace()` harus menunggu pemuatan manifest dan kueri konfigurasi layout dari Supabase.
2. **Fallback Prematur `'ws-assistant'`:**
   - Pada `ConversationEngine.jsx:873`, prop dioper ke komponen anak dengan fallback:
     ```javascript
     activeWorkspace={osState?.workspaceId || 'ws-assistant'}
     ```
   - Karena ketiga aplikasi (Assistant, Lite, Engineer) di-mount bersamaan di DOM, ketiga instance `ChatHistory` menerima `'ws-assistant'` sebagai `activeWorkspace` saat siklus render pertama.
3. **Eksekusi Kueri Supabase Sebelum Workspace Siap:**
   - Pada `ChatHistory.jsx`, fungsi `fetchChats()` langsung dipanggil saat mount tanpa memeriksa apakah `activeWorkspace` adalah workspace definitif atau sekadar fallback default. Akibatnya, instance Engineer mengeksekusi kueri `.eq('workspace_type', 'ws-assistant')`.
4. **Potensi Fallback pada Auto-Save:**
   - Pada `ConversationEngine.jsx:196`, logika auto-save sebelumnya juga memiliki fallback:
     ```javascript
     workspaceId: osStateRef.current?.workspaceId || 'ws-assistant'
     ```
     Jika auto-save terpicu sebelum `osState` terisi, percakapan Engineer/Lite akan tersimpan dengan `workspace_type: 'ws-assistant'` di database Supabase.
5. **Wildcard Listener pada EventBus:**
   - Handler event `Chat:Updated` sebelumnya memiliki kondisi toleran `if (!payload?.workspaceId || payload.workspaceId === activeWorkspace)`, yang berpotensi memicu refresh pada workspace yang tidak relevan jika payload tidak menyertakan ID workspace.

---

## 3. Solusi & Perubahan Teknis (Commit `3d5ec25`)

### A. Guard Kesiapan Workspace di `ChatHistory.jsx`
- Menambahkan pemeriksaan awal (*readiness guard*) pada `fetchChats` dan `useEffect`:
  ```javascript
  const fetchChats = useCallback(async () => {
    // [FIX: Cross-workspace leak] Jangan fetch jika activeWorkspace belum terisi
    if (!activeWorkspace) return;
    ...
  }, [activeWorkspace]);
  ```
- Memastikan `fetchChats()` dan pendaftaran listener EventBus ditunda hingga `activeWorkspace` benar-benar terisi dari hasil `switchWorkspace()`.
- Mengetatkan filter EventBus agar hanya memproses event yang cocok 100%:
  ```javascript
  if (payload?.workspaceId === activeWorkspace) {
    fetchChats();
  }
  ```

### B. Penghapusan Fallback Prematur di `ConversationEngine.jsx`
- Mengubah prop `activeWorkspace` pada render `ChatHistory`:
  ```javascript
  // SEBELUM:
  activeWorkspace={osState?.workspaceId || 'ws-assistant'}

  // SESUDAH:
  activeWorkspace={osState?.workspaceId}
  ```
  Dengan nilai `undefined` selama fase bootstrap, guard di `ChatHistory` akan menahan pemanggilan kueri sampai workspace aktual (`ws-engineer`, `ws-lite`, atau `ws-assistant`) siap.
- Menambahkan guard pada auto-save `saveChatToDB`:
  ```javascript
  const currentWsId = osStateRef.current?.workspaceId;
  if (!currentWsId) {
    isSavingRef.current = false;
    return;
  }
  ```
  Menghilangkan risiko percakapan tersimpan dengan label workspace yang salah di Supabase Cloud.

---

## 4. Hasil Verifikasi

1. **Production Build:**
   - Vite build berhasil 100% tanpa peringatan/error (2.662 modul tertransformasi).
2. **Pengujian Desktop Live oleh Owner:**
   - Owner melakukan pengujian obrolan pada masing-masing workspace desktop.
   - **Hasil:** Percakapan dan riwayat obrolan terisolasi secara sempurna, tidak ada lagi percampuran antara Workspace Assistant dan Workspace Engineer. Status: **Live-Accepted by Owner**.
