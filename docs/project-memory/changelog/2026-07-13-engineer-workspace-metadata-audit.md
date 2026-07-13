# CHANGELOG: Final Metadata Audit - Engineer Workspace

**Tanggal:** 2026-07-13
**Tipe Entry:** Architecture Audit, Metadata Design Review
**Status Saat Ini:** AUDIT COMPLETED

Sebagai tindak lanjut dari persetujuan desain metadata *Engineer Workspace*, sebuah audit lanjutan telah dilaksanakan untuk mengevaluasi ketahanan dan kelengkapan skema tersebut dalam mendukung *lifecycle-aware workspace* (GAP-NEW-009).

## 1. Kecukupan Metadata Saat Ini
Skema awal (mengandalkan atribut `capability` dan `visibility`) **cukup secara teknis namun kurang deklaratif** untuk sebuah *workspace* yang dinamis.
*   *Kondisi Saat Ini:* Jika fase *lifecycle* berubah, *backend* mencabut kapabilitas tertentu. UI kemudian merespons pencabutan tersebut dengan menyembunyikan widget.
*   *Kekurangan:* UI tidak tahu "mengapa" widget itu hilang. Dalam UX *engineering*, lebih baik widget tetap terlihat namun dalam kondisi nonaktif (*disabled* atau terkunci) disertai keterangan fase, daripada hilang mendadak.

## 2. Kebutuhan Field Tambahan
Untuk mendukung *Lifecycle-Aware Workspace* yang sesungguhnya tanpa membebani logika *frontend*, direkomendasikan penambahan dua atribut eksplisit pada spesifikasi metadata:

*   `active_phases` (Array): Daftar fase `EngineeringState` di mana widget ini boleh dioperasikan. 
    *   *Contoh:* `active_phases: ["PROPOSAL", "IMPLEMENTATION"]`
    *   *Fungsi:* Mengizinkan parser Svelte mengetahui kapan widget harus hidup.
*   `fallback_behavior` (Enum): `hidden` | `disabled` | `readonly`
    *   *Fungsi:* Mendikte apa yang harus dilakukan UI saat agen berada di luar fase yang diizinkan. Jika di-set ke `disabled`, Owner tetap bisa melihat *Approval Center* (misalnya) tapi tombolnya abu-abu dan menunjukkan pesan "Menunggu Fase Proposal".

## 3. Risiko Migrasi di Masa Depan
Jika spesifikasi YAML terus berevolusi (penambahan *field* baru), terdapat beberapa risiko teknis pada *runtime*:
*   **Risiko Undefined Error:** Klien Svelte versi lama yang membaca skema YAML versi baru mungkin mengalami *crash* jika tidak menemukan struktur yang diharapkan.
*   **Risiko State Desync:** Jika *fallback_behavior* tidak didefinisikan, UI bisa bertabrakan dengan izin sebenarnya di backend, menyebabkan agen terlihat bisa mengeksekusi sesuatu padahal akan di-*DENY* oleh *ToolDispatcher*.
*   **Mitigasi (Solusi):** 
    1. *Strict Defaults:* *Parser* di *frontend* wajib memiliki nilai *default* yang aman (misalnya, jika `active_phases` tidak ada di YAML, asumsikan `["ALL"]`. Jika `fallback_behavior` tidak ada, asumsikan `hidden`).
    2. *Metadata Versioning:* Tambahkan atribut `version: "1.0"` pada `workspace.yaml` untuk mengontrol kompatibilitas *parser*.

## 4. Keputusan Audit
*   Struktur metadata yang direkomendasikan sebelumnya disetujui, **dengan catatan** akan diperluas mencakup `active_phases` dan `fallback_behavior` demi pengalaman pengguna (*UX*) yang lebih baik dan kepatuhan terhadap siklus *Self Engineering Lifecycle*.
*   Tidak ada modifikasi *source code* atau pembuatan berkas YAML yang dilakukan pada hari ini. Penyesuaian ini murni menjadi panduan *blueprint* untuk implementasi fisik di masa depan.
