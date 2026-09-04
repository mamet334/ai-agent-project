# ROADMAP: RUNTIME CHAT SESSION STABILITY & CHAT HISTORY REALTIME PERSISTENCE

**Versi:** 1.0  
**Tanggal:** 2026-09-04  
**Status:** 🟡 PROPOSED / READY (Menunggu Persetujuan Owner untuk Eksekusi Kode)  
**Otoritas:** Mamet Ecosystem Constitution (`01_VISION_AND_PHILOSOPHY.md`, `02_ARCHITECTURE_FOUNDATION.md`, `04_OWNER_SOVEREIGNTY.md`)  
**Scope:** `AppRegistry.js`, `ConversationEngine.jsx`, `ChatHistory.jsx`, `AssistantService.js`, `useDashboardData.js`

---

## 1. Latar Belakang Masalah & Gejala

Selama pengujian operasional Mamet OS pada aplikasi desktop, teridentifikasi dua anomali kritis yang mengganggu pengalaman pengguna (*user experience*) dan stabilitas runtime:

1. **Gejala #1: Siklus Refresh / Berkedip Berulang (*Unmount Loop & Session Wipe*)**
   - Layar pada seluruh kolom chat (Assistant, MametLite, dan Engineer) tampak mengalami *flicker* (berkedip atau me-refresh sekejap) secara periodik dengan interval waktu tertentu.
   - Sesi percakapan yang sedang aktif tiba-tiba hilang total (*reset* ke antarmuka kosong dengan `messages: []`). Teks yang sedang diketik atau respon streaming yang sedang berlangsung langsung terhapus.
2. **Gejala #2: Riwayat Percakapan Tidak Menampilkan Entri Terbaru (*Stale Chat History*)**
   - Setelah percakapan selesai atau disimpan ke database Supabase, bilah samping (*sidebar*) `ChatHistory` tidak menampilkan judul percakapan yang baru saja dilakukan.
   - Daftar riwayat percakapan tampak macet (*stale*) dan hanya menampilkan percakapan lama, kecuali pengguna me-reload seluruh aplikasi atau berganti workspace.

---

## 2. Investigasi Forensik & Analisis Akar Masalah (*Root Cause Analysis*)

Berdasarkan penelusuran alur kode sumber dan verifikasi data pada database Supabase, ditemukan 5 akar masalah yang saling berkaitan:

### 2.1. Akar Masalah Utama: Anti-Pattern Komponen Anonim Inline di `AppRegistry.js`
- **Lokasi:** [`frontend/src/core/application/AppRegistry.js:5-13`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/application/AppRegistry.js#L5-L13)
- **Kode Asal:**
  ```javascript
  const GenericAppWrapper = ({ appId, workspaceId, mainPanel: MainPanel }) => {
    return React.createElement(WorkspaceProvider, { appId, defaultWorkspaceId: workspaceId },
      React.createElement(AppShell, {
        mainPanel: (props) => React.createElement(Suspense, { 
          fallback: React.createElement('div', { className: "p-4 text-emerald-500" }, "Loading Module...") 
        }, React.createElement(MainPanel, props))
      })
    );
  };
  ```
- **Mekanisme Kegagalan:**
  Fungsi `mainPanel: (props) => ...` didefinisikan sebagai fungsi baru (*new anonymous function reference*) di setiap siklus eksekusi `GenericAppWrapper`.
- **Pelanggaran Prinsip React Reconciler:**
  Di dalam [`AppShell.jsx:121`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/components/workbench/AppShell.jsx#L121), komponen dirender sebagai `<MainPanelComponent sessionId={workspaceState.sessionId} />`. Karena referensi fungsi berubah setiap kali parent me-render, algoritma diffing React menganggapnya sebagai tipe komponen yang sama sekali baru (*component type mismatch*).
- **Dampak Fatal:**
  React secara paksa **meng-UNMOUNT (menghancurkan)** seluruh instance `ConversationEngine` beserta state lokal (`useState` untuk `messages`, `input`, `isLoading`), menampilkan Suspense fallback/layar kosong sesaat (**efek kedipan/flicker**), lalu me-**REMOUNT** instance baru dari nol dengan state awal kosong.

---

### 2.2. Tabrakan Kunci Tunggal `localStorage` Antar Tiga Aplikasi Chat
- **Lokasi:** [`frontend/src/components/workbench/ConversationEngine.jsx:52, 207, 233`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/components/workbench/ConversationEngine.jsx#L52)
- **Kode Asal:**
  ```javascript
  localStorage.getItem('mamet_v4_current_chat_id');
  localStorage.setItem('mamet_v4_current_chat_id', currentChatId);
  localStorage.removeItem('mamet_v4_current_chat_id');
  ```
- **Mekanisme Kegagalan:**
  [`ApplicationContainer.jsx`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/components/os/ApplicationContainer.jsx) me-render seluruh 9 aplikasi desktop di DOM secara bersamaan (hanya disembunyikan menggunakan kelas Tailwind `hidden` saat tidak aktif). Tiga aplikasi chat aktif bersamaan di memori:
  1. `app:assistant` (workspace `ws-assistant`)
  2. `app:mametlite` (workspace `ws-lite`)
  3. `app:engineer` (workspace `ws-engineer`)
- **Dampak Fatal:**
  Ketiga aplikasi berebut menulis dan membaca kunci tunggal yang sama: `'mamet_v4_current_chat_id'`. Saat salah satu aplikasi tidak menemukan ID chat tersebut di database miliknya (karena perbedaan `workspace_type`), baris 231–234 mengeksekusi `localStorage.removeItem('mamet_v4_current_chat_id')`. Ketika terjadi kedipan unmount/remount, ID chat di browser sudah hilang, menyebabkan sesi aktif gagal di-restore dan hilang permanen.

---

### 2.3. Pemicu Siklus Berkala (*Periodic Trigger Loop*)
Mengapa proses re-render/kedipan terjadi dengan waktu tertentu?
1. **Debounced Sync Layout di `WorkspaceManager.js:228`:**
   Timer debounce 2 detik memicu penyimpanan layout dan memancarkan event `Workspace:StateChanged`. `WorkspaceProvider` yang berlangganan event ini melakukan pembaruan state (`setOsState`), yang memicu re-render pada `GenericAppWrapper` dan mengeksekusi unmount loop.
2. **Auto-Refresh Sesi Supabase Auth di `App.jsx:20`:**
   Listener `supabase.auth.onAuthStateChange` memperbarui objek `session` di level root secara berkala (misal saat token refresh atau perubahan window focus), memicu re-render ke seluruh cabang aplikasi.
3. **HTTP 400 Bad Request Retry Loop di `useDashboardData.js:116`:**
   Query `verification_audit_logs` meminta kolom `created_at` (padahal skema DB menggunakan `timestamp`), sehingga ditolak oleh PostgREST dengan kode 400. Client `@supabase/supabase-js` secara internal melakukan retry berulang.

---

### 2.4. Pembatalan Auto-Save Sesi Akibat Unmount Mendadak
- **Lokasi:** [`frontend/src/components/workbench/ConversationEngine.jsx:175-199`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/components/workbench/ConversationEngine.jsx#L175-L199)
- **Kode Asal:**
  ```javascript
  const timer = setTimeout(async () => {
    ...
    await assistantService.saveChatToDB({ ... });
  }, 1000);
  return () => clearTimeout(timer);
  ```
- **Mekanisme Kegagalan:**
  Penyimpanan otomatis ke Supabase ditunda selama 1.000 ms setelah pesan terakhir diterima. Jika unmount loop terjadi dalam jendela waktu 1 detik tersebut, fungsi cleanup effect mengeksekusi `clearTimeout(timer)`. Akibatnya, pesan yang baru saja diterima atau diketik oleh pengguna **dibatalkan sebelum sempat ditulis ke database Supabase**.

---

### 2.5. Keterbatasan Mekanisme Pembaruan pada `ChatHistory.jsx`
- **Lokasi:** [`frontend/src/components/workbench/ChatHistory.jsx:53-71`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/components/workbench/ChatHistory.jsx#L53-L71) & [`AssistantService.js:1034`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/runtime/services/AssistantService.js#L1034)
- **Mekanisme Kegagalan:**
  1. **Absennya Event Notifikasi:** `AssistantService.saveChatToDB()` menulis ke tabel `chats` tanpa memancarkan event notifikasi apa pun ke UI.
  2. **Keterbatasan Spesifikasi Browser:** `ChatHistory.jsx` mendengarkan `window.addEventListener('storage', ...)`. Berdasarkan standar W3C Web API, event `storage` **hanya terpicu di tab/jendela lain**, dan TIDAK AKAN PERNAH terpicu di jendela yang sama. Selain itu, kunci `mamet_chat_update` bahkan tidak pernah di-set oleh bagian mana pun dari sistem.
  3. **Logika State Updater Tidak Menambah Item Baru:**
     ```javascript
     useEffect(() => {
       if (activeChatId) {
         setChats(prev => prev.map(c => ({ ...c, isActive: c.id === activeChatId })));
       }
     }, [activeChatId]);
     ```
     Kode hanya memetakan `isActive` pada array `prev`. Karena chat baru belum ada di memori `prev` (fetch hanya terjadi 1 kali saat mount), percakapan baru tidak pernah masuk ke daftar sidebar.
  4. **Isolasi Ketat `workspace_type`:** Query memfilter secara kaku `.eq('workspace_type', activeWorkspace)`. Percakapan yang dibuat di `ws-lite` atau `ws-engineer` tidak akan pernah muncul saat pengguna membuka tab `ws-assistant`.

---

## 3. Rencana Solusi Arsitektural Permanen (*Architectural Remediation*)

Sesuai filosofi Konstitusi Mamet (*System First, Root Cause First, Long-Term Architecture*), solusi yang dirancang adalah perbaikan permanen tanpa tambalan sementara:

```
[AppRegistry.js]
  Stabilisasi Reconciler: Bungkus MainPanel dengan Komponen Statis (0 Anonymous Functions)
    → React memelihara identitas komponen identik
    → 0 Unmount, 0 Flicker, State memori (messages, input) utuh 100%
         │
         ▼
[ConversationEngine.jsx]
  Isolasi Key LocalStorage per Workspace: `mamet_v4_${workspaceId}_current_chat_id`
    → ws-assistant, ws-lite, ws-engineer memiliki slot memori independen
    → Tidak ada penghapusan silang (cross-tenant localStorage collision)
         │
         ▼
[AssistantService.js]
  Integrasi EventBus Reaktif saat saveChatToDB berhasil
    → EventBus.emit('Chat:Updated', { chatId, workspaceId, title })
         │
         ▼
[ChatHistory.jsx]
  1. Langganan EventBus 'Chat:Updated' → auto fetchChats() seketika
  2. Dukungan sinkronisasi lokal instan saat activeChatId berganti
  3. Penanganan filter workspace yang adaptif dan konsisten
         │
         ▼
[useDashboardData.js]
  Remediasi kolom skema `verification_audit_logs` (timestamp)
    → 0 HTTP 400 Bad Request, menghentikan retry loop di background
```

---

## 4. Matriks Rencana Implementasi File-by-File

### Fase 1: Stabilisasi Komponen di `frontend/src/core/application/AppRegistry.js`
- **Tujuan:** Menjamin stabilitas referensial komponen `mainPanel` di React.
- **Rencana Perubahan:**
  - Membuat komponen pembungkus statis terisolasi di luar fungsi factory:
    ```javascript
    const ModuleSuspenseWrapper = React.memo(({ component: Component, ...props }) => (
      <Suspense fallback={<div className="p-4 text-emerald-500 font-mono text-xs">Loading Module...</div>}>
        <Component {...props} />
      </Suspense>
    ));
    ```
  - Menyediakan referensi komponen yang stabil ke `AppShell` sehingga React tidak pernah meng-unmount `ConversationEngine` saat parent re-render.

### Fase 2: Isolasi Kunci Storage di `frontend/src/components/workbench/ConversationEngine.jsx`
- **Tujuan:** Mencegah tabrakan kunci ID chat antar workspace Assistant, Lite, dan Engineer.
- **Rencana Perubahan:**
  - Menentukan kunci spesifik:
    ```javascript
    const currentWorkspaceId = osState?.workspaceId || 'ws-assistant';
    const storageKey = `mamet_v4_${currentWorkspaceId}_current_chat_id`;
    ```
  - Inisialisasi dan sinkronisasi `currentChatId` menggunakan `storageKey` spesifik per workspace.
  - Menghapus panggilan `clearTimeout` destruktif saat unmount normal jika masih ada antrean simpan yang belum dieksekusi (*flush on unmount*).

### Fase 3 & 4: Reaktif EventBus & Pembaruan `ChatHistory.jsx`
- **Tujuan:** Riwayat percakapan otomatis muncul seketika saat chat baru dibuat atau disimpan.
- **Rencana Perubahan:**
  - Di `AssistantService.js:saveChatToDB`:
    Setelah `supabase.from('chats').insert/update` berhasil, panggil:
    ```javascript
    const eventBus = this.serviceManager?.get('EventBus');
    eventBus?.emit('Chat:Updated', { chatId: finalChatId, workspaceId });
    ```
  - Di `ChatHistory.jsx`:
    - Mengganti listener window `storage` yang tidak efektif dengan langganan resmi ke `EventBus`:
      ```javascript
      useEffect(() => {
        const eventBus = kernel.serviceManager?.get('EventBus');
        if (!eventBus) return;
        return eventBus.on('Chat:Updated', (payload) => {
          const rec = payload?.data || payload;
          if (!rec.workspaceId || rec.workspaceId === activeWorkspace) {
            fetchChats();
          }
        });
      }, [activeWorkspace]);
      ```
    - Memastikan daftar riwayat langsung memuat entri baru tanpa perlu refresh aplikasi.

### Fase 5: Remediasi Observability di `frontend/src/hooks/useDashboardData.js`
- **Tujuan:** Mengeliminasi error HTTP 400 berulang di background.
- **Rencana Perubahan:**
  - Memperbaiki query kolom `verification_audit_logs`:
    Mengganti referensi kolom `created_at` ke `timestamp` (sesuai skema tabel Supabase).

---

## 5. Rencana Verifikasi & Kriteria Keberhasilan (*Exit Criteria*)

Implementasi baru dianggap selesai jika memenuhi seluruh kriteria berikut:

| No | Kriteria Uji | Metode Verifikasi | Target Hasil |
|---|---|---|---|
| 1 | **Stabilitas Reconciler (0 Unmount)** | Mengetik di kolom chat Assistant & Engineer sembari menunggu layout sync & auth token refresh | Kolom teks & pesan tidak berkedip, tidak ter-reset, memori obrolan utuh |
| 2 | **Isolasi Multi-Workspace Chat** | Membuka Assistant, mengirim pesan, lalu berpindah ke Lite & Engineer | Masing-masing workspace mempertahankan sesi percakapannya tanpa menghapus workspace lain |
| 3 | **Realtime Chat History Sync** | Mengirim pesan pertama pada percakapan baru | Judul percakapan baru langsung muncul di sidebar `ChatHistory` tanpa perlu refresh halaman |
| 4 | **Observability Zero 400 Error** | Memeriksa DevTools Network tab saat Dashboard aktif | 0 error 400 Bad Request pada query `verification_audit_logs` |
| 5 | **Production Build Validation** | Menjalankan `npm run build` di direktori `frontend` | PASS (100% Sukses, 0 Error sintaks/bundling) |
| 6 | **Live Desktop Acceptance** | Pengujian langsung oleh Owner di aplikasi desktop | Bebas kedipan, sesi tidak pernah hilang, riwayat mutakhir |

---

## 6. Riwayat & Dokumen Terkait

- [`INDEX-ROADMAP.md`](./INDEX-ROADMAP.md) — Peta Dokumen Induk Roadmap Mamet OS Ecosystem
- [`ZERO-LEAKAGE-RAG-TENANT-ISOLATION.md`](./ZERO-LEAKAGE-RAG-TENANT-ISOLATION.md) — Isolasi Tenant RAG & Audit Multi-Akun
- [`TAHAP1-memory-system-finalization.md`](./TAHAP1-memory-system-finalization.md) — Finalisasi Sistem Memori & UI Purge Lifecycle
- [`2026-09-04-fix-backlog-module-discovery-and-react-render-warning.md`](../project-memory/changelog/2026-09-04-fix-backlog-module-discovery-and-react-render-warning.md) — Remediasi Backlog Module Discovery & Warning Render Phase
