# RFC-016: Backend Authoritative Execution Architecture

**Date:** 2026-07-11
**Status:** PROPOSED (WAITING_FOR_TELEMETRY)
**Related Gaps:** GAP-NEW-009, GAP-NEW-019
**Dependency:** RFC-014 (Engineering Lifecycle), RFC-015 (Tool Dispatcher)

> **Decision Note:**
> Implementasi ditangguhkan. Mamet menghindari *speculative architecture*. Prinsip *Observability before Enforcement* berlaku. RFC ini akan dipertimbangkan ulang (Architecture Review Kedua) setelah *Shadow Mode* RFC-015 menghasilkan telemetri yang memadai terkait metrik *False Positive* dan *False Negative*.

---

## 1. Context & Motivation

Saat ini, Mamet OS menganut model *Hybrid Authority* untuk eksekusi alat (*tools*).
Walaupun `ToolDispatcher` (RFC-015) di sisi *backend* mampu mengobservasi dan memfilter instruksi LLM (*Stream Interceptor*), hak prerogatif eksekusi aktual untuk operasi *filesystem* dan eksekusi *shell* masih berada di *Desktop Svelte Client* (Frontend). 

**Masalah (*The Architecture Gap*):**
1. Frontend menerima *Server-Sent Events (SSE)* mentah dan mengeksekusi JSON yang menyerupai *Function Call*.
2. Frontend dapat diintervensi, diretas (DevTools), atau mengalami malfungsi (*Rogue Edits*).
3. Selama Desktop memiliki hak akses komputasi tanpa validasi berlapis (hanya *Shadow Audit* di backend), perlindungan *Zero Rogue Edits* (GAP-NEW-019) dan *Owner Sovereignty* belum tercapai mutlak.

Oleh karena itu, diperlukan pergeseran paradigma arsitektur terbesar dalam sejarah Mamet OS: **Memindahkan Authority dari Desktop ke Backend**.

---

## 2. Target Architecture

**As-Is (Desktop Authoritative):**
LLM → Stream Handler → *Desktop UI* → (Evaluasi Klien) → *Eksekusi Lokal* (File/Shell)

**To-Be (Backend Authoritative):**
LLM → *ToolDispatcher* (Backend) → Evaluasi 6 Lapis Policy → Pembuatan **Signed Execution Token (SET)** → *Desktop UI* → *Eksekusi Lokal (Hanya jika SET Valid)*

Pada arsitektur *To-Be*, Desktop diturunkan derajatnya menjadi sekadar *Dumb Terminal / Renderer* yang hanya berhak mengeksekusi perintah jika ia menerima *Cryptographic Token* atau persetujuan absolut dari backend.

---

## 3. Proposal Implementasi: Signed Execution Token (SET)

Untuk menghindari modifikasi berat pada infrastruktur jembatan Desktop saat ini (seperti Tauri/Electron IPC), perlindungan akan didasarkan pada *Token Exchange*.

### 3.1. Mekanisme SET
1. Saat LLM memproduksi sebuah perintah (`write_to_file`, `<terminal>`), `StreamInterceptor` (Fase 3 dari RFC-015) tidak lagi membiarkan teks mentah mengalir.
2. *Interceptor* akan mem-*buffer* blok perintah tersebut.
3. *Interceptor* meneruskan blok perintah ke `ToolDispatcher`.
4. Jika `ToolDispatcher` merespons `ALLOW`, ia menerbitkan sebuah `Signed Execution Token` (sebuah JWT berumur sangat pendek atau SHA-256 HMAC dari *payload* perintah yang di-enkripsi dengan *secret key* backend).
5. *Backend* menyuntikkan token ini ke dalam aliran SSE klien: `<execute token="abc.def.ghi">{"tool":"write_to_file", ...}</execute>`.

### 3.2. Penyesuaian Desktop Bridge (Frontend)
1. Desktop tidak akan pernah lagi merespons blok ```json biasa atau tag `<terminal>` mentah.
2. Desktop hanya mengeksekusi blok `<execute token="...">`.
3. Sebelum eksekusi, Desktop akan melakukan verifikasi (atau sekadar memercayai token jika jembatannya tertutup secara lokal, namun verifikasi backend direkomendasikan jika IPC rentan).

---

## 4. Keuntungan Arsitektur Ini

1. **Absolute Hard Enforcement (Phase 4 dari RFC-015 tercapai).** Backend memiliki wewenang penuh (memotong token) jika melanggar *Risk Gate* atau *EngineeringLifecycle*.
2. **Deterministic.** Mustahil bagi klien atau *hallucination* LLM merakit *Function Call* berbahaya tanpa memegang *Secret Key* penerbit SET.
3. **Penyelesaian GAP-NEW-019 secara mutlak.** *Zero Rogue Edits* terjamin.
4. **Owner Sovereignty.** Hanya *Owner* (via otorisasi *Lifecycle*) yang dapat memerintahkan *backend* menerbitkan token eksekusi (*misal:* status sedang `WAITING_OWNER_APPROVAL`).

---

## 5. Rencana Transisi (Migration Plan)

Transisi otoritas adalah hal kritis. Akan dilaksanakan melalui tahapan berikut:

1. **Evaluasi Shadow Mode (Saat ini):** Memantau volume `WOULD_DENY` dari RFC-015. Jika *False Positive Rate* stabil di angka ~0%, lanjutkan ke Langkah 2.
2. **Penerbitan SET (Dual Mode):** *Backend* mulai merakit dan mengirimkan tag `<execute>`, tetapi Desktop masih menoleransi format lama (*backward compatibility*).
3. **Desktop Refactoring:** Memodifikasi *parser* di Svelte Desktop untuk menolak seluruh injeksi yang tidak memiliki SET.
4. **Backend Enforce (Hard Gate Aktif):** *Backend* mengaktifkan pemblokiran (`DENY` secara aktual) dan tidak lagi menerbitkan SET untuk perintah yang melanggar.

---

## 6. Open Questions / Kesimpulan untuk Review
*   Apakah Svelte Desktop akan melakukan *decode* JWT, atau sekadar meneruskan token kembali ke backend melalui API untuk validasi lapis kedua sebelum memanggil fungsi OS?
*   Bagaimana *latency* bertambah akibat mekanisme *buffering* sebelum penerbitan SET?

RFC ini diajukan untuk mendapatkan persetujuan konseptual (*Architecture Review*) sebelum penulisan sebaris kode pun dimulai.
