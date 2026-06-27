# ADR-0006: Two-Brain Context Model for Engineer

**Date:** 2026-06-27
**Status:** Accepted
**Phase:** Phase 6 (Refinement)

## Context

Sebelumnya, semua konteks Engineer (ADR, Coding Rules, Tasks, Git Diff, Verification) dimuat dalam satu blok query tanpa pemisahan eksplisit antara pengetahuan yang bersifat statis (jarang berubah) dan dinamis (berubah setiap sesi). Hal ini menyebabkan:
- Token yang tidak efisien (memuat ADR yang sama setiap sesi)
- Context yang sulit dioptimalkan karena semua bercampur
- Tidak ada prioritisasi antara fondasi arsitektur vs. fakta runtime

## Decision

Engineer kini memiliki **dua kategori konteks yang terpisah eksplisit**:

### STATIC ENGINEERING KNOWLEDGE
Dimuat setiap sesi — merupakan "fondasi" Engineer yang jarang berubah:
- Vision & Filosofi
- Architecture decisions (ADR aktif)
- Coding Rules
- Folder Structure
- Project Memory (status: Verified)

### DYNAMIC ENGINEERING CONTEXT
Dimuat **berdasarkan konteks permintaan** — merupakan "fakta sesi" yang selalu berbeda:
- Current Task (InProgress / Proposed)
- Git Diff (diberikan oleh user)
- Affected Files (diidentifikasi dari diff)
- Architecture Gaps (Open / InProgress)
- Verification Results
- Build Results, Runtime Logs, Test Results

### Alur Pengambilan Konteks
```
Static Knowledge (fondasi, dimuat per sesi)
+
Dynamic Context (fakta, dimuat per permintaan)
↓
Review / Patch / Health Report
```

### Lazy-Loading Rule
- **Deprecated ADRs**: Hanya dimuat jika pesan mengandung kata kunci konflik/sejarah.
- **Test Results & Build Logs**: Hanya dimuat jika user secara eksplisit menyertakan atau meminta analisis runtime.

## Consequences

- Query database menjadi lebih terstruktur dan eksplisit dalam memisahkan Static vs Dynamic.
- Token lebih efisien: Static dimuat ringan, Dynamic hanya dimuat saat relevan.
- Lebih mudah dioptimalkan di masa depan (misal: caching Static Knowledge untuk sesi berulang).
- Engineer Prompt menjadi lebih mudah di-audit karena setiap bagian memiliki label sumber yang jelas.
