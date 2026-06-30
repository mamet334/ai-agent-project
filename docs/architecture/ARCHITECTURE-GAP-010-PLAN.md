# ARCHITECTURE ANALYSIS: GAP-010 (Telemetry Leakage via Event Bus)

## 1. Analisis Arsitektur
Sistem *Mamet AI* telah mengimplementasikan MAEF Event Bus (ADR-011) yang bertugas menyalurkan sinyal-sinyal kritis seperti `Capability.Executed`, `Tool.Requested`, dan `Tool.Completed`. Namun, saat ini *subscriber* untuk telemetri eksekusi belum diimplementasikan di `audit_subscriber.ts` (modul ini hanya mencatat `Evidence.Evaluated` dan `Verification.Completed`).
Akibatnya, jejak audit eksekusi *sub-agent* dan penggunaan *Capability Adapter* lenyap begitu *Edge Function* selesai mengeksekusi *request* pengguna. Ini melanggar prinsip visibilitas operasional penuh dari *Mamet AI Engineering Framework*.

## 2. Proposal Desain
Kita akan mengarahkan semua sisa event MAEF ke dalam tabel penyimpanan permanen yang sudah ada, yaitu `agent_logs`. Tabel ini memiliki skema yang tepat (`user_id`, `event_type`, `provider`, `message`, `metadata`, `created_at`).
Kita akan memanfaatkan `rctx.tasks.fire()` yang merupakan utilitas asinkron MAEF (terbungkus oleh *Edge Function WaitUntil*) untuk menembak *database* di latar belakang (background) sehingga proses logging **TIDAK AKAN** menambah beban latensi pada pengguna.

## 3. Rencana Implementasi
- **Step 1**: Membuat fungsi baru bernama `persistTelemetryLog` di dalam `lib/verification/verification_service.ts` yang menangani koneksi Supabase dan eksekusi `insert` ke tabel `agent_logs`.
- **Step 2**: Menambahkan pendengar event (event listeners) baru di `lib/event/subscribers/audit_subscriber.ts` untuk 4 event kritis:
  - `Capability.Executed`
  - `Tool.Requested`
  - `Tool.Invoked`
  - `Tool.Completed`
- **Step 3**: Di dalam setiap pendengar tersebut, kita akan mengekstrak metrik (*provider*, durasi, *status*) dan mengirimnya ke Supabase secara aman (Non-Blocking).

## 4. Rencana Verifikasi
- Mengkompilasi ulang dengan `tsc` untuk memastikan tanda tangan (signature) fungsi di `verification_service.ts` tidak membentur tipe yang ada.
- Verifikasi logika asinkron untuk memastikan *event bus* tetap *fire-and-forget* (tidak menyebabkan proses *hang*).

=================================================
OWNER APPROVAL
=================================================
Saya akan **MENUNGGU** persetujuan Anda sebelum menerapkan fitur telemetri persisten ini.
Apakah rencana penambalan *GAP-010* disetujui?
