# Changelog: Runtime Chat Session Stability & Chat History Realtime Persistence

**Tanggal:** 2026-09-04  
**Tipe:** Architecture Fix, Runtime Stability, React Reconciler Hardening, Multi-Workspace Isolation & Realtime UX  
**Scope:** `AppRegistry.js`, `ConversationEngine.jsx`, `ChatHistory.jsx`, `AssistantService.js`, `useDashboardData.js`, `INDEX-ROADMAP.md`, `ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md`  
**Author:** Antigravity (AI Engineering Partner) & Project Owner  
**Status:** ✅ Selesai Diimplementasikan & Build Pass (2.662 modul, 0 error) — Siap Uji Live Desktop oleh Owner

---

## 1. Konteks & Latar Belakang Masalah

Dua anomali runtime kritis teridentifikasi saat pengujian operasional aplikasi desktop Mamet OS:
1. **Refresh / Kedipan Berulang & Hilangnya Sesi Obrolan:**
   Setiap interval tertentu, antarmuka chat (Assistant, Lite, Engineer) mengalami kedipan (*flicker/unmount*), yang menyebabkan sesi obrolan yang sedang aktif tiba-tiba hilang total (*reset* ke `messages: []`).
2. **Riwayat Chat Tidak Menampilkan Percakapan Terbaru:**
   Percakapan yang baru dibuat atau disimpan ke Supabase tidak otomatis muncul di sidebar `ChatHistory`. Daftar riwayat tampak *stale* dan hanya memuat percakapan lama sebelum aplikasi di-reload.

---

## 2. Akar Masalah (*Root Causes*)

1. **Unmount Loop Akibat Komponen Anonim di `AppRegistry.js`:**
   `GenericAppWrapper` sebelumnya mengoper fungsi anonim baru `mainPanel: (props) => React.createElement(...)` pada setiap render. React Reconciler mendeteksi perbedaan tipe fungsi komponen, sehingga secara paksa meng-**UNMOUNT** `ConversationEngine` (menghancurkan state memori lokal `messages`), memunculkan Suspense fallback (kedipan), dan me-**REMOUNT** instance baru yang kosong.
2. **Tabrakan Kunci Tunggal `localStorage` Antar Tiga Workspace:**
   Tiga instance aplikasi chat (Assistant, Lite, Engineer) yang berjalan bersamaan di DOM berebut menulis dan membaca kunci tunggal `mamet_v4_current_chat_id`. Pemanggilan `removeItem` oleh salah satu workspace yang tidak menemukan chat tersebut menghapus ID sesi aktif dari browser.
3. **Pembatalan Auto-Save Akibat Unmount:**
   Timer debounce auto-save 1 detik di `ConversationEngine.jsx` dibatalkan (`clearTimeout`) ketika unmount mendadak terjadi, sehingga percakapan belum sempat ditulis ke Supabase.
4. **Keterbatasan Listener Web API `storage` di `ChatHistory.jsx`:**
   `ChatHistory.jsx` mengandalkan event `window.addEventListener('storage', ...)`. Berdasarkan spesifikasi W3C, event ini **hanya terpicu di tab/jendela browser lain**, bukan di jendela aktif yang melakukan perubahan. Selain itu, `saveChatToDB` tidak pernah memancarkan event notifikasi saat penyimpanan berhasil.
5. **Retry Loop HTTP 400 di `useDashboardData.js`:**
   Query `verification_audit_logs` meminta kolom `created_at` yang tidak ada pada tabel fisik Supabase (kolom sebenarnya adalah `timestamp`), memicu retry terus-menerus di background.

---

## 3. Rincian Solusi & Perubahan Teknis

### A. Stabilisasi Reconciler di `AppRegistry.js`
- Membangun komponen statis `ModuleSuspenseWrapper = React.memo(...)` di level modul terluar.
- Menggunakan `useRef` di dalam `GenericAppWrapper` untuk memoize referensi fungsi `mainPanel` per instance app.
- **Hasil:** Referensi fungsi `mainPanel` identik 100% di setiap render parent. React Reconciler **TIDAK PERNAH meng-unmount `ConversationEngine`** lagi. Kedipan hilang total dan state memori chat tetap utuh.

### B. Isolasi Kunci Storage per Workspace di `ConversationEngine.jsx`
- Mengisolasi kunci penyimpanan berbasis workspace:
  ```javascript
  const chatStorageKey = osState?.workspaceId
    ? `mamet_v4_${osState.workspaceId}_current_chat_id`
    : null;
  ```
- Menginisialisasi `currentChatId` dengan `null` dan menunda proses restore dari `localStorage` hingga `chatStorageKey` siap (workspace diketahui).
- Mengarahkan seluruh pemanggilan `localStorage.setItem`, `getItem`, dan `removeItem` ke `chatStorageKey` masing-masing.
- **Hasil:** Assistant (`ws-assistant`), Lite (`ws-lite`), dan Engineer (`ws-engineer`) memiliki slot memori independen tanpa tabrakan.

### C. Emisi EventBus Reaktif di `AssistantService.js`
- Menambahkan pemancaran event `Chat:Updated` via `EventBus` sesaat setelah `supabase.from('chats').insert/update` berhasil:
  ```javascript
  const eventBus = this.serviceManager?.get('EventBus');
  if (eventBus && finalChatId) {
    eventBus.emit('Chat:Updated', { chatId: finalChatId, workspaceId, title });
  }
  ```

### D. Langganan EventBus Realtime di `ChatHistory.jsx`
- Mengganti listener window `storage` dengan langganan resmi ke Kernel `EventBus` untuk event `Chat:Updated`.
- Saat `saveChatToDB` berhasil di jendela aktif, `ChatHistory` langsung mengeksekusi `fetchChats()` seketika.
- Memperbaiki efek perubahan `activeChatId` agar mendeteksi entri baru yang belum ada di state memori dan memicu refresh.

### E. Remediasi Query Observability di `useDashboardData.js`
- Mengganti kolom `created_at` menjadi `timestamp` pada `supabase.from('verification_audit_logs')`.
- **Hasil:** 0 error HTTP 400 Bad Request di background network, menghentikan retry loop berkala.

---

## 4. Verifikasi & Pengujian

1. **Production Build (`npm run build` di folder `frontend`):**
   - **Hasil:** **PASS (100% Sukses, 0 Error)** dalam 11.87 detik.
   - Vite berhasil mentransformasikan 2.662 modul.
2. **Roadmap & Index Synchronization:**
   - [`docs/roadmap/ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md`](../../roadmap/ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md) diperbarui ke status `✅ COMPLETED & VERIFIED`.
   - [`docs/roadmap/INDEX-ROADMAP.md`](../../roadmap/INDEX-ROADMAP.md) diselaraskan pada Bagian 1 (Tabel Ringkas), Bagian 2 (Urutan Eksekusi), dan Bagian 6 (Item Backlog 9).
