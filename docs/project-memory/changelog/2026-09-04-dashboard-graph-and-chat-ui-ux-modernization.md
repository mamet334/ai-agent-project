# Changelog: Modernisasi UI/UX Dashboard Knowledge Graph, Semantic Inspector, & Full-Width Chat Workspace

**Tanggal:** 2026-09-04  
**Tipe:** UI/UX Modernization, Constitution 23 Alignment & Ergonomics Polish  
**Scope:** `HomeDashboard.jsx`, `ActivityGraph.jsx`, `NodeInspector.jsx`, `ObservabilityPanel.jsx`, `ConversationEngine.jsx`, `MemoryContextPanel.jsx`, `FolderSelector.jsx`, `ResearchApp.jsx`, `useDashboardData.js`  
**Author:** Antigravity (AI Engineering Partner) & Project Owner  
**Status:** ✅ Selesai Diimplementasikan, Diverifikasi, & Build Berhasil (0 Error)

---

## 1. Konteks & Latar Belakang

Sesi ini berfokus pada penyelarasan antarmuka pengguna (UI/UX) di dua area utama Mamet OS:
1. **Home Dashboard (Observatory & Knowledge Graph):** Memenuhi amanat **Konstitusi 23 (`23_HOME_DASHBOARD_SPEC.md`)** dengan menghidupkan Obsidian-style Neural Brain Graph, membersihkan status false-down, mengeliminasi teks `UNKNOWN` pada inspektor node, dan menyediakan pembaca dokumen RAG in-place.
2. **Conversation Engine (Chat Workspace):** Memberikan kendali ergonomis kepada pengguna untuk meminimalkan panel samping (Memory Context & MAEF Monitor) agar kolom percakapan dapat membentang penuh (Full-Width), serta merampingkan baris ketik input pesan di bagian bawah.

Seluruh modifikasi dilakukan murni pada lapisan presentasi frontend (`frontend/src/`) tanpa memodifikasi logika backend atau service asisten.

---

## 2. Rincian Perubahan yang Diimplementasikan

### A. Liveness Telemetry & Sanitasi Dashboard
- **`useDashboardData.js`**:
  - Menerapkan evaluasi liveness berbasis **jendela waktu 15 menit** sehingga log kegagalan verifikasi masa lampau tidak lagi mematikan sistem menjadi `SYSTEM STATUS: DOWN`.
  - Menghitung sampel latensi gabungan (P50, P95, P99) secara realtime dengan biaya **$0.00 / 0 Token**.
  - Auto-load trace timeline eksekusi terkini saat login tanpa menampilkan placeholder `NO TELEMETRY AVAILABLE`.
- **`ObservabilityPanel.jsx`**:
  - Sanitasi rekursif pesan error untuk mencegah keluaran teks `[object Object]` pada Recent Failures.
  - Menambahkan jembatan navigasi tombol `Resolusi di Chat ➔` yang mengirimkan sinyal event `Memory:OpenConflicts` via EventBus.

### B. Obsidian Knowledge Graph — Constitution 23
- **`useDashboardData.js` & `HomeDashboard.jsx`**:
  - Mengimplementasikan 5 palet warna semantik resmi Konstitusi 23:
    - 🟢 **Hijau (`#22c55e`):** Node Memori Pengguna.
    - 🟣 **Ungu (`#a855f7`):** Node Dokumen & Arsip RAG.
    - 🟡 **Kuning (`#eab308`):** Node Sesi Percakapan (Chats).
    - ⚪ **Putih Kristal (`#ffffff`):** Node Pusat Inti Kernel (SUPABASE).
    - 🔴 **Merah Berdenyut (`#ef4444`):** Node Memori berstatus `CONFLICT_PENDING_REVIEW`.
- **`ActivityGraph.jsx`**:
  - **Header & Legenda:** Diperbarui menjadi **MAMET KNOWLEDGE GRAPH** *(Neural Brain Constellation — Constitution 23)* dengan legenda semantik.
  - **HUD Floating Knowledge Explorer:** Menambahkan panel melayang transparan kaca gelap (`bg-black/35 backdrop-blur-2xl`) di pojok kanan atas kanvas dengan tab filter cepat (`Semua (114)`, `🔴 Konflik (1)`, `🟣 RAG (45)`, `🟢 Memori (68)`), pencarian instan, dan navigasi **Klik-untuk-Meluncur (*Fly & Zoom*)** ke titik target.
  - **Direct Canvas Node Labels:** Mencetak label nama entitas langsung di bawah lingkaran graf kanvas secara adaptif terhadap level zoom kamera menggunakan `nodeCanvasObjectMode`.

### C. Semantic Contextual Node Inspector & In-Place Document Reader
- **`NodeInspector.jsx`**:
  - **Pembersihan `UNKNOWN` Clutter:** Menghapus tabel kaku yang memaksakan kolom generik (`Cost`, `Provider`, `Dependencies`) pada dokumen dan memori.
  - **Kartu Kontekstual Berbasis Entitas:**
    - **Memori:** Menampilkan status aktif/konflik, frekuensi pemanggilan AI, relasi aktif, dan tombol resolusi langsung ke chat.
    - **Dokumen RAG:** Menampilkan format berkas, jumlah potongan pgvector, status kesiapan pencarian RAG, dan pembaca teks in-place.
    - **Chat:** Menampilkan peran workspace (Engineer/Assistant/Lite) dan waktu sesi.
    - **Pipeline Service:** Menampilkan status kesehatan riil (`HEALTHY`, `DEGRADED`, `DOWN`) dan latensi.
  - **In-Place Chunk Reader:** Tombol `[ 👁️ Baca Isi Teks ]` yang langsung memuat dan menampilkan teks potongan asli dari tabel pgvector `document_chunks` di samping graf tanpa harus berpindah layar.
  - **Eliminasi Tombol Redundan:** Menghapus tombol navigasi luar yang tidak diperlukan agar ruang baca teks dokumen menjadi maksimal.
- **`ResearchApp.jsx`**:
  - Mendukung auto-filter dari `sessionStorage ('research_search_query')` saat navigasi antar-modul.

### D. Chat Mode Minimization & Full-Width Conversation
- **`MemoryContextPanel.jsx`**:
  - Menambahkan tombol minimize (`—`) di header panel di samping tombol tutup (`✕`).
- **`ConversationEngine.jsx`**:
  - **Mode Luas Penuh (Full-Width Chat):** Ketika Memory Context di-minimize, sistem secara otomatis menciutkan panel memori DAN menutup widget `MAEF Monitor` dari workbench kanan, sehingga kolom obrolan mengambil 100% lebar layar tanpa terbagi lagi.
  - **Floating Controls Toolbar (Kanan Atas Chat):**
    - `[ 🧠 Memory (${count}) ]`: Tombol pil sakelar untuk membuka/menutup Memory Context secara instan.
    - `[ 🛡️ Monitor ]`: Tombol sakelar untuk membuka/menutup MAEF Monitor sesuai kebutuhan.
    - `[ ⛶ Mode Luas ]`: Tombol pintas sekali klik untuk membersihkan semua panel samping.

### E. Perampingan Input Bar & Integrasi Folder Picker
- **`FolderSelector.jsx`**:
  - Menambahkan mode `compact={true}`: Menampilkan tombol ikon folder `[ 📁 ]` minimalis dengan lencana nama folder aktif, tanpa teks status bising.
- **`ConversationEngine.jsx`**:
  - Menghapus 3 baris teks status bising di atas kotak chat (*"Belum ada folder yang dipilih"* dan *"Mode Desktop (Electron) — Akses penuh ke file system"*).
  - Mengintegrasikan FolderSelector compact langsung di dalam kapsul baris input sebelah kiri.
  - Merampingkan padding dan tinggi textarea (`min-h-[38px] py-2 px-3`) sehingga area input menjadi ramping, elegan, dan proporsional.

---

## 3. Daftar File yang Diubah

| File | Tipe Perubahan | Deskripsi |
| :--- | :---: | :--- |
| `frontend/src/hooks/useDashboardData.js` | Modifikasi | Liveness 15 menit, warna semantik graf Konstitusi 23, metrik latensi realtime |
| `frontend/src/components/dashboard/HomeDashboard.jsx` | Modifikasi | Palet warna node graf semantik, pass `serviceManager` ke `NodeInspector` |
| `frontend/src/components/dashboard/ActivityGraph.jsx` | Modifikasi | HUD Knowledge Explorer, Canvas Label Renderer, Glassmorphism polish |
| `frontend/src/components/dashboard/NodeInspector.jsx` | Modifikasi | Semantic Contextual Cards, In-Place Chunk Reader pgvector, hapus tombol redundan |
| `frontend/src/components/dashboard/ObservabilityPanel.jsx` | Modifikasi | Sanitasi error `[object Object]`, bridge tombol resolusi memori |
| `frontend/src/components/research/ResearchApp.jsx` | Modifikasi | Auto-search filter dari sessionStorage |
| `frontend/src/components/workbench/ConversationEngine.jsx` | Modifikasi | Full-Width chat layout, floating toolbar, FolderSelector compact terintegrasi, tool badges & grounding sources |
| `frontend/src/components/workbench/MemoryContextPanel.jsx` | Modifikasi | Tombol minimize (`—`), integrasi event bus konflik |
| `frontend/src/components/FolderSelector.jsx` | Modifikasi | Mode compact untuk integrasi di dalam baris input chat |

---

## 4. Hasil Verifikasi & Validasi

1. **Frontend Production Build:**  
   Perintah: `npm run build` di direktori `frontend/`.  
   Hasil: **SUCCESS (Exit Code 0)** dalam 11,86 detik (2.662 modul ditransformasikan tanpa error).
2. **Zero-Token & Data Integrity Guarantee:**  
   Seluruh observabilitas dan pembacaan graf 100% berbasis query statis HTTP ke Supabase dan pgvector tanpa menggunakan kuota token LLM ($0.00).
3. **User Acceptance Verification:**  
   Seluruh antarmuka telah diverifikasi langsung oleh Project Owner melalui tangkapan layar aplikasi desktop (Knowledge Graph, In-Place Text Reader, dan Full-Width Chat Input).
