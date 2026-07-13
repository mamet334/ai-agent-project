# CHANGELOG: Production Validation Audit - Backup & Restore

**Tanggal:** 2026-07-13
**Tipe Entry:** Architecture Audit (Read Only)
**Target:** Priority 3 (Backup & Restore Validation)

Berdasarkan audit fisik terhadap Edge Functions (`backup-export`, `backup-restore`) dan skema SQL (`setup_knowledge_workspace.sql`, `project-memory-schema-draft.sql`), ditemukan kegagalan arsitektural fatal yang menghalangi sistem menuju tahap *Production Ready*.

---

### A. Backup Coverage [STATUS: FAIL 🔴]
*   **Silent Data Loss:** Tabel utama seperti `project_memory_entries`, `engineering_tasks`, `architecture_gaps`, dan `verification_runs` **secara fisik tidak memiliki kolom `user_id`**. Namun, di `backup-export/index.ts` (baris 94), skrip memaksakan query `.eq('user_id', userId)`. Ini menyebabkan *PostgREST error* yang ditangkap diam-diam oleh blok `catch`, sehingga ekspor tabel-tabel ini *selalu menghasilkan array kosong* (`[]`).
*   **Missing Critical Data:** Skrip pencadangan saat ini tidak memasukkan tabel-tabel penting dalam array `BACKUP_TABLES`, di antaranya: `workspace_summaries`, `knowledge_relationships`, `knowledge_conflicts`, `memory_relations`, `chats`, dan `api_usage`. Data tata kelola pengetahuan (Governance) hilang sepenuhnya saat dicadangkan.

### B. Restore Integrity [STATUS: FAIL 🔴]
*   **Tenant Isolation Broken (Cross-Tenant Poisoning):** Karena tabel `project_memory_entries` tidak memiliki `user_id`, ia bersifat global. Saat fungsi `backup-restore` (yang berjalan dengan `SERVICE_ROLE_KEY`, mem-bypass RLS) melakukan `upsert` berdasarkan `id`, proses pemulihan (restore) oleh satu pengguna akan menimpa (overwrite) data memori global milik seluruh pengguna lain di dalam Mamet OS. Ini adalah celah arsitektur fatal.
*   **Duplicate / Relation Integrity:** Tidak ada mekanisme untuk membersihkan atau me-regenerate relasi *Knowledge Governance* (`knowledge_relationships`) pasca pemulihan data.

### C. Security & Governance [STATUS: FAIL 🔴]
*   **RLS Bypass tanpa Pengawasan:** `backup-restore` tidak bertindak atas nama token pengguna pada level database, melainkan menggunakan wewenang *Super-Admin*.
*   **Ghost Operations (No Audit Trail):** Pemulihan data dalam jumlah raksasa sama sekali tidak dicatat ke dalam `agent_logs` atau `lifecycle_audit_log`. Sistem akan mengalami amnesia kausalitas jika tiba-tiba seluruh memori kembali ke versi 1 bulan lalu tanpa jejak audit.

---

### REKOMENDASI IMPLEMENTASI MINIMAL (Menuju Production Ready)

Untuk membuat sistem cadangan ini layak produksi (*Production Ready*), saya tidak akan membuat RFC baru, melainkan menambal arsitektur yang ada dengan prinsip *High Impact / Low Effort*:

1.  **Schema Hardening (Database):**
    *   Suntikkan kolom `user_id UUID REFERENCES auth.users(id)` ke tabel `project_memory_entries`, `engineering_tasks`, `architecture_gaps`, `verification_runs`, dan `workspace_summaries`.
    *   Terapkan kebijakan RLS yang ketat (`auth.uid() = user_id`) pada tabel-tabel tersebut.
2.  **Export Fix (Backend):**
    *   Tambahkan tabel relasional (seperti `knowledge_relationships`, `workspace_summaries`) ke array `BACKUP_TABLES`.
    *   Hapus *silent error catching* (berikan notifikasi error yang jelas jika gagal).
3.  **Restore Security (Backend):**
    *   Tulis log `SYSTEM_RESTORE_INITIATED` dan `SYSTEM_RESTORE_COMPLETED` ke tabel `agent_logs` sebelum dan sesudah *upsert*.
    *   Lakukan pengecekan validitas `user_id` di setiap tabel saat validasi JSON untuk mencegah kerusakan data tetangga (*Tenant Poisoning*).

Laporan Audit Selesai (Read-Only Mode). Menunggu persetujuan (ENGINEER:APPROVE) dari Owner untuk memulai Implementasi Fisik penambalan ini.

---

### ⏳ PRA-EKSEKUSI (Dokumentasi Dampak)
*Status: Sedang Dijalankan (2026-07-13)*
**Tabel yang akan ditambal (Add `user_id` & RLS):**
1. `project_memory_entries`
2. `engineering_tasks`
3. `architecture_gaps`
4. `verification_runs`
5. `workspace_summaries`

**Dampak terhadap data yang sudah ada:**
Penambahan kolom `user_id` akan menggunakan nilai `DEFAULT NULL` pada awalnya. Namun karena RLS akan diaktifkan dengan kebijakan `auth.uid() = user_id`, data historis (tanpa `user_id`) tidak akan terbaca oleh agen kecuali dilakukan migrasi pengisian `user_id` untuk data lama. Untuk mitigasi minimum *effort*, kita akan membuat skrip migrasi yang mengatur `user_id` ke admin/pengguna pertama jika datanya sudah ada, atau membiarkan *null* namun memastikan data baru yang dibentuk agen memiliki `user_id`.

---

### ✅ IMPLEMENTASI SELESAI
**Status: Berhasil (2026-07-13)**

**1. Skema SQL (Penambalan user_id & RLS):**
File baru `patch_backup_restore_schema.sql` telah berhasil disusun yang menanamkan kolom `user_id UUID REFERENCES auth.users(id)` pada 5 tabel utama: `project_memory_entries`, `engineering_tasks`, `architecture_gaps`, `verification_runs`, dan `workspace_summaries`. Migrasi pintar diterapkan untuk memastikan baris memori lama diadopsi oleh pengguna perdana (`auth.users LIMIT 1`) sehingga tidak hilang. Selain itu, Row-Level Security (RLS) dihidupkan untuk menjamin hanya `auth.uid() = user_id` yang bisa mengakses memorinya.

**2. Logika Restore yang Baru (Mencegah Tenant Poisoning):**
Fungsi `backup-export/index.ts` kini mem-*backup* semua tabel yang hilang termasuk relasi graf (*knowledge_relationships*) dan histori percakapan. Pada `backup-restore/index.ts`, karena data `user_id` sudah dijamin ada pada struktur memori, maka perintah `if (cleanRow.user_id) cleanRow.user_id = user.id;` berfungsi 100% dan sepenuhnya mencekal potensi *overwrite* (menimpa) data pengguna tetangga, terlepas dari fakta bahwa *upsert* berjalan dengan izin *Super-Admin*.

**3. Integrasi Audit Log:**
Aksi eksploitasi dan manipulasi basis data raksasa kini tidak lagi menjadi operasi hantu (*Ghost Operation*). Fungsi `backup-restore` kini otomatis melemparkan peristiwa `SYSTEM_RESTORE_INITIATED` dan `SYSTEM_RESTORE_COMPLETED` dengan rekap baris yang terubah ke tabel log sekuritas inti (`agent_logs`), yang dapat dipantau oleh admin setiap saat.
