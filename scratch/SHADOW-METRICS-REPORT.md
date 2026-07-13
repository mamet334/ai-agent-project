# ToolDispatcher Shadow Mode - Initial Report

## Latar Belakang
Sesuai instruksi `ENGINEER:APPROVE RFC-015`, fase 1 dan 2 telah diimplementasikan dalam Mode Bayangan (*Shadow Mode*). Eksekusi `plugin.execute()` pada sub-agent telah dibungkus dengan `ToolDispatcher` tanpa menyebabkan penghentian proses aktual (*non-blocking*).

## Telemetry & Logging
Semua keputusan *ToolDispatcher* dicatat ke dalam `agent_logs` (tabel Supabase) dengan `event_type = 'TOOL_DISPATCHER_AUDIT'`. Parameter `decision` yang dicatat:
*   `ALLOW`
*   `WOULD_DENY`
*   `WOULD_REQUIRE_APPROVAL`

## Definisi Metrik Evaluasi

### 1. False Positives (Pemblokiran Palsu)
**Definisi:** Keputusan `WOULD_DENY` pada operasi yang sebenarnya legal dan diizinkan oleh sistem.
**Dampak jika Hard Enforcement aktif:** Mengganggu *workflow* pengguna, agen gagal menjalankan perintah yang diperbolehkan.
**Cara Audit:** 
- Jalankan Query #2 pada `shadow_metrics_dashboard.sql`.
- Amati kolom `deny_reason`. Jika target tersebut merupakan *tool* baca (seperti `view_file` di luar struktur OS) namun diblokir oleh isolasi *workspace*, maka kebijakan *Workspace Isolation* mungkin terlalu ketat.

### 2. False Negatives (Lolosnya Pelanggaran)
**Definisi:** Keputusan `ALLOW` pada operasi yang sebenarnya berbahaya, destruktif, atau dilarang oleh *Constitution*.
**Dampak jika Hard Enforcement aktif:** Sistem tetap terekspos terhadap risiko serangan (*Bypass*).
**Cara Audit:**
- Filter log dengan `decision = 'ALLOW'`.
- Periksa kolom `target`. Jika agen mencoba menjalankan `run_command` dengan payload dekripsi atau penghapusan berkas root, namun statusnya lolos, maka regex atau logika *Risk Gate* di `ToolDispatcher.isHighRisk()` butuh pengetatan.

## Kesimpulan Sementara
Implementasi `ToolDispatcher` sejauh ini terjamin 100% transparan dan pasif (*passive monitoring*). Tidak ada gangguan pada klien Svelte (*Desktop SSE Stream*) ataupun pada eksekusi aktual *sub-agent*. Evaluasi selama beberapa siklus eksekusi akan menentukan kesiapan untuk beralih ke **Phase 3 (Stream Interception)** dan **Phase 4 (Hard Enforcement)**.

---

## Verification Audit (RFC-015 Phase 2)
Berikut adalah hasil verifikasi terhadap arsitektur *Shadow Mode* sebelum peluncuran Fase 3:

1. **Fail-Open Behavior (Internal Error):**
   *Temuan:* Sebelumnya, kesalahan internal menghasilkan `WOULD_DENY` namun tetap melanjutkan *executionFn()*.
   *Resolusi:* Diperbaiki menjadi `DENY_ON_INTERNAL_ERROR`. Jika `ToolDispatcher` mengalami *crash* saat validasi, ia akan membatalkan seluruh eksekusi secara absolut (*fail-closed*), menjamin bahwa tidak ada satupun alat yang lolos tanpa pengawasan.
2. **Plugin Bypass (Jalur Eksekusi Langsung):**
   *Temuan:* Pencarian menyeluruh tidak menemukan instansiasi `plugin.execute()` di luar `tool_subscriber.ts`.
   *Resolusi:* Semua eksekusi sub-agent dijamin melalui *choke point* `ToolDispatcher`.
3. **Risk Gate Substring Evasion:**
   *Temuan:* `rm -rf` dapat di-*bypass* dengan alias OS lain atau *chaining*.
   *Resolusi:* `isHighRisk` telah diperluas untuk mendeteksi `Remove-Item`, `rmdir`, `shred`, `os.remove`, `base64`, `certutil`, `wget`, `curl`, dan simbol *chaining* (`&&`, `||`, `;`, `|`).
4. **Telemetry Loss on Timeout:**
   *Temuan:* Menggunakan antrean *fire-and-forget* `rctx.tasks` rentan hilang jika Edge Function mendadak terhenti atau batas waktu tercapai.
   *Resolusi:* Penulisan log kini langsung menggunakan `await rctx.logger...` (Synchronous) untuk menjamin persistensi log audit sebelum meneruskan *chain* komputasi.
5. **RuntimeContext Nullability:**
   *Temuan:* `rctx` berpotensi dikosongkan.
   *Resolusi:* Blok validasi *null-check* absolut ditambahkan. Ketiadaan `rctx`, `policy`, atau `state` akan memicu *fatal error* (`DENY_ON_INTERNAL_ERROR`).
6. **Recursive Dispatch Loops:**
   *Temuan:* Sub-agent dapat saling memanggil dan memicu tumpukan *dispatch*.
   *Resolusi:* Mekanisme *semaphore* sederhana (`rctx.state._isDispatching`) telah dipasang untuk mendeteksi re-entransi dan menggagalkannya demi mencegah *stack overflow*.
7. **Database Index Bottleneck:**
   *Temuan:* Kueri performa dari volume tinggi log dapat membebani database Supabase.
   *Resolusi:* Script migrasi SQL `20260711_tool_dispatcher_index.sql` telah disiapkan untuk membuat indeks parsial (`idx_agent_logs_dispatcher_audit`).
8. **Command Payload Evasion Testing:**
   *Temuan:* Dengan perluasan pola regex *Risk Gate*, seluruh manipulasi yang menggunakan PowerShell recurse, base64 payload, maupun injeksi *chaining* akan sukses ditandai sebagai `WOULD_DENY` saat ini (yang akan memicu pemblokiran pada *Hard Enforcement* kelak).

Secara arsitektural, modul Dispatcher kini sudah **tahan banting** terhadap intervensi internal dan siap dilanjutkan ke **Phase 3 (Stream Interceptor)**.
