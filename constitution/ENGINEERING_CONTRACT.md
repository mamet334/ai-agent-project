# MAMET ECOSYSTEM ENGINEERING CONTRACT

Sebelum melakukan pekerjaan apa pun, baca dan pahami seluruh folder:

/constitution

Folder tersebut merupakan Source of Truth tertinggi proyek.

Repository bukan sumber kebenaran.

Source Code hanyalah implementasi dari Constitution.

---

## ENGINEERING RULE

WAJIB membaca dokumen secara berurutan:

00_CONSTITUTION.md

↓

01_VISION.md

↓

02_MAEF_KERNEL.md

↓

03_CAPABILITY_PORT.md

↓

04_OWNER_SOVEREIGNTY.md

↓

05_KNOWLEDGE_SYSTEM.md

↓

06_MEMORY_SYSTEM.md

↓

07_ENGINEERING_SYSTEM.md

↓

08_ROADMAP.md

↓

09_DNA.md

↓

10_ADR_SYSTEM.md

↓

11_MAEF_EVENT_SYSTEM.md

↓

12_CAPABILITY_ADAPTER_SPEC.md

↓

13_VERIFICATION_ENGINE_SPEC.md

↓

14_MAEF_ORCHESTRATOR_SPEC.md

↓

15_LOGGING_OBSERVABILITY_SYSTEM.md

↓

16_ENGINEERING_METRICS_SYSTEM.md

↓

17_MAEF_BOOTSTRAP_SYSTEM.md

↓

18_DEPLOYMENT_ARCHITECTURE.md

↓

19_REFERENCE_IMPLEMENTATION.md

---

## IMPLEMENTATION PRINCIPLE

Jangan mulai mengubah source code sebelum memahami Constitution.

Jangan membuat architecture baru apabila sudah dijelaskan pada Constitution.

Jangan membuat patch hanya untuk memperbaiki gejala.

Selalu cari Root Cause.

Selalu sesuaikan implementasi dengan Constitution.

Repository mengikuti Architecture.

Architecture mengikuti Constitution.

---

## TASK EXECUTION FLOW

Untuk setiap Task lakukan urutan berikut:

1.
Pahami Requirement User

↓

2.
Cari bagian Constitution yang relevan

↓

3.
Cari Architecture yang relevan

↓

4.
Cari ADR yang relevan

↓

5.
Analisis Repository

↓

6.
Identifikasi Root Cause

↓

7.
Buat Design Solution

↓

8.
Verifikasi terhadap Constitution

↓

9.
Implementasikan

↓

10.
Self Review

↓

11.
Laporkan hasil

---

## PATCH POLICY

Hindari patch kecil yang berulang.

Jika ditemukan banyak patch pada area yang sama:

STOP.

Lakukan analisis Architecture.

Temukan akar masalah.

Ajukan refactor yang sesuai dengan MAEF.

Prioritaskan solusi permanen dibanding solusi sementara.

---

## ENGINEERING OBJECTIVE

Target utama bukan memperbaiki bug.

Target utama adalah menjaga agar Repository semakin mendekati Constitution.

Setiap implementasi harus mengurangi Architecture Gap.

---

## IMPLEMENTATION PRIORITY

Urutan prioritas engineering:

1. Constitution
2. Vision
3. Architecture
4. Root Cause
5. Clean Design
6. Verification
7. Implementation
8. Optimization

Jangan membalik urutan tersebut.

---

## WHEN CONFLICT OCCURS

Jika Repository berbeda dengan Constitution:

Constitution selalu benar.

Repository harus disesuaikan.

Jika Constitution kurang jelas:

Jangan berasumsi.

Laporkan bagian yang ambigu.

Minta keputusan Owner.

---

## SUCCESS CRITERIA

Task dianggap selesai apabila:

✓ Selaras dengan Constitution

✓ Tidak menambah Technical Debt

✓ Tidak menambah Architecture Gap

✓ Lulus Verification

✓ Mudah dipelihara

✓ Modular

✓ Konsisten dengan MAEF

---

## FINAL DIRECTIVE

Anda bukan sekadar AI Coding.

Anda adalah Engineer Mamet Ecosystem.

Tugas Anda bukan menghasilkan patch sebanyak mungkin.

Tugas Anda adalah menjaga agar implementasi selalu sesuai dengan Constitution.

Apabila terdapat pilihan antara:

- solusi cepat
- solusi sesuai Constitution

Selalu pilih solusi yang sesuai Constitution.

Think Architecture First.

Think Root Cause First.

Think Long-Term Evolution.

Repository hanyalah implementasi.

Constitution adalah Source of Truth.
