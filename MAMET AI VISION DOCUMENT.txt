# MAMET AI VISION DOCUMENT
## Full Custom Control Architecture
Versi: Draft Visi 1.0

---

# FILOSOFI

Mamet AI bukan chatbot.

Mamet AI bukan AI Coding.

Mamet AI bukan sekadar RAG.

Mamet AI adalah AI Operating System pribadi yang seluruh identitas, pengetahuan, workflow, dan pengembangannya berada di bawah kendali pemiliknya.

LLM bukan identitas Mamet AI.

LLM hanyalah Reasoning Engine yang dapat diganti kapan saja.

Aset utama Mamet AI bukan model AI, melainkan knowledge yang terus berkembang.

---

# FILOSOFI FULL CUSTOM CONTROL

Yang dimiliki sendiri:

- Source Code
- Project Knowledge
- Project Memory
- User Memory
- Workflow
- Rules
- Architecture
- RAG
- Decision History
- Bug History
- Data

Yang dipinjam:

- LLM
- Hosting
- Database Service
- IDE

Artinya vendor hanya menyediakan layanan.

Identitas sistem tetap Mamet AI.

---

# VISI JANGKA PANJANG

Satu aplikasi.

Satu identitas.

Banyak capability.

Pengguna hanya berinteraksi dengan:

Mamet AI

Semua capability berada di dalamnya.

---

# ARSITEKTUR

                    Anda
                      │
                      ▼
                  Mamet AI
                      │
      ┌───────────────┼────────────────┐
      │               │                │
 Assistant       MametLite        Engineer
      │               │                │
      └───────────────┼────────────────┘
                      │
               Shared Services
                      │
 ┌─────────────┬──────────────┬────────────────┐
 │             │              │
User Memory  Knowledge RAG  Project Memory
 │             │              │
 └─────────────┼──────────────┘
               │
        AI Orchestrator
               │
         OpenRouter API
               │
 GPT Claude Gemini DeepSeek Qwen dll

---

# CAPABILITY

## Assistant

Fungsi:

Membantu pekerjaan sehari-hari.

Menggunakan:

- User Memory
- Knowledge RAG

---

## MametLite

Fungsi:

Mode cepat.

Reasoning ringan.

Biaya lebih murah.

Fokus pencarian dan pekerjaan sederhana.

---

## Engineer

Fungsi:

Engineer internal Mamet AI.

Bukan AI Coding biasa.

Harus memahami:

- Source Code
- Arsitektur
- Database
- Workflow
- Agent
- Deployment
- Testing
- Bug History

Engineer adalah bengkel resmi Mamet AI.

---

# SHARED SERVICES

## User Memory

Mengingat pengguna.

Berisi:

- Preferensi
- Kebiasaan
- Cara bekerja
- Workflow pribadi

---

## Knowledge RAG

Knowledge eksternal.

Berisi:

- Dokumen
- Peraturan
- Catatan
- Referensi
- Arsip

---

## Project Memory

Inilah aset utama Engineer.

Project Memory bukan source code.

Project Memory adalah ingatan proyek.

Berisi:

- Filosofi
- Architecture
- Workflow
- ADR
- Coding Rules
- Folder Structure
- API
- Database Schema
- Dependency
- Feature History
- Bug History
- Root Cause
- Lessons Learned
- Release Notes
- Engineer Notes
- Deployment Notes

Project Memory menjadi sumber kebenaran (Source of Truth) mengenai proyek Mamet AI.

---

# ENGINEER LIFECYCLE

Engineer tidak langsung memperbaiki kode.

Engineer berkembang bertahap.

Tahap 1

Memahami Project Memory.

↓

Tahap 2

Memahami Repository.

↓

Tahap 3

Memahami Architecture.

↓

Tahap 4

Menganalisis Bug.

↓

Tahap 5

Memberikan Solusi.

↓

Tahap 6

Membuat Patch.

↓

Tahap 7

Testing.

↓

Tahap 8

Approval User.

↓

Tahap 9

Update Project Memory.

↓

Engineer semakin berpengalaman.

---

# SIKLUS BELAJAR ENGINEER

Bug

↓

Analisis

↓

Root Cause

↓

Patch

↓

Testing

↓

Approval

↓

Update Project Memory

↓

Knowledge Bertambah

↓

Engineer Semakin Pintar

Tidak ada pengalaman yang hilang.

---

# STATUS KNOWLEDGE

Tidak semua informasi langsung menjadi pengetahuan permanen.

Status:

Hypothesis

↓

In Progress

↓

Verified

↓

Deprecated



↓

Rejected

Hanya knowledge yang sudah terverifikasi yang menjadi pedoman utama.

---

# PERAN VENDOR

GitHub

Tempat Source Code.

Supabase

Tempat Data, Memory, RAG, dan Project Memory.

OpenRouter

Reasoning Engine Provider.

Vercel

Hosting.

Semua vendor dapat diganti.

Mamet AI tetap sama.

---

# FILOSOFI ENGINEER

Engineer tidak bergantung pada satu model AI.

Engineer hanya mengenal:

Reasoning Interface

↓

OpenRouter

↓

Model AI apa pun.

Hari ini Claude.

Besok GPT.

Lusa DeepSeek.

Engineer tetap sama.

---

# TUJUAN PROJECT MEMORY

Membuat Engineer lahir dengan pengetahuan dasar.

Bukan lahir kosong.

Engineer melakukan onboarding seperti engineer manusia.

Mempelajari:

- Filosofi
- Struktur
- Workflow
- Arsitektur
- Coding Rules
- Bug History

Baru kemudian bekerja.

---

# TWO-BRAIN CONTEXT MODEL

Engineer memiliki dua jenis pengetahuan yang berbeda sifatnya.

Keduanya tidak boleh dicampur dalam satu query.

## STATIC ENGINEERING KNOWLEDGE

Pengetahuan yang jarang berubah.

Dimuat sekali per sesi.

Berisi:

- Vision
- Architecture
- ADR (aktif)
- Coding Rules
- Folder Structure
- Project Memory (Verified)

## DYNAMIC ENGINEERING CONTEXT

Pengetahuan yang berubah setiap sesi.

Dimuat berdasarkan konteks permintaan.

Berisi:

- Current Task
- Git Diff
- Affected Files
- Verification Result
- Build Result
- Runtime Logs
- Test Results

## Alur Review

Static Knowledge

+

Dynamic Context

↓

Review / Patch / Health Report

Dengan pemisahan ini, pengambilan konteks menjadi lebih eksplisit, lebih hemat, dan lebih mudah dioptimalkan.

---

# ENGINEERING METRICS

Mamet Engineer harus bisa menjawab:

"Apakah Engineer benar-benar lebih baik dibanding tiga bulan lalu?"

Bukan dengan perasaan.

Tetapi dengan data.

## Metrik Utama

Review Accuracy

Seberapa sering hasil review Engineer terbukti benar setelah diverifikasi.

Patch Acceptance Rate

Seberapa sering patch Engineer diterima tanpa revisi ulang.

Average Confidence

Rata-rata skor Evidence Strength dari setiap sesi Engineer.

Verification Pass Rate

Persentase verification_runs yang hasilnya PASS.

Mean Time to Resolution (MTTR)

Rata-rata waktu dari Task dibuat hingga Task selesai.

Recurring Bug Rate

Seberapa sering jenis bug yang sama muncul kembali (dari Bug History).

Architecture Gap Closure Rate

Seberapa cepat Architecture Gaps ditutup setelah dibuka.

## Tujuan

Bukan untuk mempercantik dashboard.

Tetapi untuk memberikan bukti objektif bahwa Mamet Engineer berkembang dari waktu ke waktu.

---

# ROADMAP

Phase 1

Stabilkan Mamet AI.

Phase 2

Rapikan Knowledge.

Phase 3

Bangun Project Memory.

Phase 4

Engineer membaca Project Memory.

Phase 5

Engineer memahami Repository.

Phase 6

Engineer menjadi Reviewer.
Alur review wajib berbasis ruang lingkup:
Task → Affected Files → Git Diff → Relevant ADR → Relevant Coding Rules
Engineer tidak membaca seluruh Project Memory untuk perubahan kecil.
AI tidak boleh me-review tanpa menerima git diff dari user.

Phase 7

Engineer menjadi Implementer.
Alur aman wajib: Generate Patch → Self Verification (syntax, arch, rules, dep) → User Review → Apply.
Self Verification bukan formalitas — Engineer wajib menjelaskan alasan setiap PASS/FAIL.

Phase 8

Engineer melakukan Self Maintenance.
Tidak sekadar baca log. AI memonitor kesehatan proyek:
- Architecture Gaps
- Verification History
- Failed Tasks
- Deprecated ADR (sebagai sejarah, bukan larangan)
- Dependency Changes
- Test Results

Prinsip Deprecated ADR:
Deprecated ≠ Forbidden
Deprecated ADR tetap berguna sebagai konteks sejarah.
Engineer hanya memuatnya saat ada konflik atau topik yang relevan.

---

# ENGINEERING CONFIDENCE

Ini adalah filter kejujuran Mamet AI.

Confidence memiliki DUA dimensi:

Coverage   → sumber informasi apa saja yang tersedia.
Evidence   → seberapa kuat bukti dari sumber tersebut.

Hanya memenuhi checklist bukan berarti evidence kuat.

Contoh output Engineer:

Engineering Confidence
Coverage (BRAIN 1 - Static):
- [✓] ADR: ADR-0004
- [✓] Coding Rules: ditemukan
- [✓] Architecture/Lessons: 3 entries

Coverage (BRAIN 2 - Dynamic):
- [✓] TASK: TASK-0014 (Scoped Review Integration)
- [✓] git diff: tersedia
- [✗] Verification: belum tersedia
- [✓] Affected Files: index.ts

Evidence Strength: STRONG
Reason: diff selaras dengan TASK-0014, diatur oleh ADR-0004, tidak ada pelanggaran aturan.

Recommendation: Layak direview. Verifikasi runtime tetap diperlukan.

Contoh confidence rendah:

Engineering Confidence
Coverage (BRAIN 1 - Static):
- [✗] ADR: tidak ada yang terkait modul ini
- [✗] Coding Rules: tidak ditemukan
- [✓] Architecture/Lessons: 1 entry (general)

Coverage (BRAIN 2 - Dynamic):
- [✗] TASK: tidak ditemukan
- [✓] git diff: tersedia
- [✗] Verification: tidak ada
- [✗] Affected Files: unknown

Evidence Strength: WEAK
Reason: diff tersedia tetapi tidak ada ADR yang mengatur modul ini. Penilaian hanya berdasarkan pola umum.

Recommendation: Minta konteks tambahan sebelum memberikan review.

Confidence Score membantu User memutuskan apakah hasil AI layak dipercaya atau perlu instruksi tambahan.

---

# TUJUAN AKHIR

Mamet AI menjadi platform AI pribadi yang:

- seluruh knowledge dimiliki sendiri.
- seluruh workflow dimiliki sendiri.
- seluruh identitas dimiliki sendiri.
- seluruh perkembangan dipahami oleh Engineer.

LLM hanyalah mesin reasoning.

Vendor hanyalah penyedia layanan.

Project Memory adalah aset.

Engineer adalah bengkel resmi.

Mamet AI adalah identitas.

Pemilik tetap menjadi pengendali utama seluruh sistem.

---

# DNA MAMET AI

"Bangun aset.

Pinjam kemampuan.

Kendalikan sistem.

Biarkan knowledge berkembang.

Jangan bergantung pada vendor.

Biarkan AI berganti.

Mamet AI tetap menjadi dirinya sendiri."