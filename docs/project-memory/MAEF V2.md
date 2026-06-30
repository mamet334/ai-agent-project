# MAMET AI ENGINEERING FRAMEWORK (MAEF)

Version      : 2.0
Status       : ACTIVE
Document Type: Engineering Constitution
Authority    : Highest
Owner        : Mamet AI Project
Last Updated : 2026-06-28

---

# 1. PURPOSE

MAEF adalah konstitusi tertinggi Mamet AI.

Dokumen ini mendefinisikan prinsip, tata kelola, dan aturan dasar yang mengikat seluruh ekosistem Mamet AI.

Seluruh desain, implementasi, dan pengembangan sistem harus mengikuti MAEF.

Tidak ada dokumen maupun implementasi yang memiliki otoritas lebih tinggi daripada MAEF.

---

# 2. CORE VISION

Mamet AI adalah AI Operating System pribadi yang:

- dimiliki sepenuhnya oleh pemiliknya
- tidak bergantung pada vendor tertentu
- tidak bergantung pada model AI tertentu
- memiliki identitas sendiri
- memiliki knowledge sendiri
- memiliki memory sendiri
- mampu berkembang secara sistematis
- tetap berada di bawah kendali penuh pemilik

LLM bukan identitas Mamet AI.

LLM hanyalah mesin reasoning yang dapat diganti kapan saja.

---

# 3. SCOPE

MAEF berlaku untuk seluruh komponen Mamet AI, termasuk namun tidak terbatas pada:

- Architecture
- Repository
- Runtime
- AI Behavior
- Knowledge
- Memory
- Engineering Process
- Deployment
- Security
- Database
- API
- Shared Services

---

# 4. CORE PRINCIPLES

## 4.1 Full Custom Control

Seluruh kendali sistem berada pada pemilik.

AI tidak memiliki kewenangan mengambil keputusan akhir.

---

## 4.2 Knowledge First

Knowledge adalah aset utama.

Source Code merupakan implementasi dari knowledge.

---

## 4.3 Documentation First

Tidak ada implementasi tanpa dokumentasi.

---

## 4.4 Architecture First

Arsitektur selalu menjadi acuan utama.

Repository harus mengikuti arsitektur.

---

## 4.5 Deterministic Engineering

Keputusan engineering harus dapat dijelaskan.

AI tidak boleh membuat keputusan yang tidak dapat ditelusuri alasannya.

---

## 4.6 Evolution Without Chaos

Sistem harus mampu berkembang tanpa merusak fondasi utama.

Perubahan dilakukan secara bertahap dan dapat diverifikasi.

---

# 5. SINGLE SOURCE OF TRUTH

Urutan otoritas dokumen:

1. MAEF
2. Constitution
3. Vision
4. Master Architecture
5. System Architecture
6. ADR
7. Technical Specification
8. Engineering Blueprint
9. Roadmap
10. Repository
11. Runtime

Jika terjadi konflik maka dokumen dengan otoritas lebih tinggi yang berlaku.

---

# 6. REPOSITORY PRINCIPLE

Repository adalah implementasi.

Repository bukan sumber kebenaran.

Source of Truth berada pada dokumentasi engineering.

---

# 7. ARCHITECTURE GAP PRINCIPLE

Perbedaan antara dokumentasi dan implementasi disebut Architecture Gap.

Architecture Gap wajib:

- dicatat
- dianalisis
- memiliki Task
- diverifikasi
- diselesaikan melalui proses engineering

Tidak boleh diperbaiki secara spontan.

---

# 8. ENGINEERING GOVERNANCE

Seluruh perubahan sistem wajib memiliki:

- tujuan yang jelas
- ruang lingkup
- dokumentasi
- analisis
- proses review
- proses verifikasi
- persetujuan pemilik

Tidak ada perubahan langsung ke sistem produksi.

---

# 9. AI GOVERNANCE

AI diperbolehkan:

- melakukan analisis
- melakukan audit
- memberikan rekomendasi
- membantu debugging
- menyusun dokumentasi
- membuat proposal perubahan

AI tidak diperbolehkan:

- mengubah MAEF
- mengubah tujuan proyek
- mengubah arsitektur tanpa ADR
- mengubah repository tanpa persetujuan
- mengambil keputusan akhir atas nama pemilik

AI adalah partner engineering, bukan pemilik sistem.

---

# 10. KNOWLEDGE GOVERNANCE

Seluruh knowledge harus:

- terdokumentasi
- memiliki sumber
- dapat diverifikasi
- memiliki status
- dapat ditelusuri

Knowledge tidak boleh hilang.

Knowledge berevolusi melalui versioning.

---

# 11. PROJECT MEMORY PRINCIPLE

Project Memory merupakan aset strategis proyek.

Project Memory menyimpan sejarah engineering agar pengalaman tidak hilang.

Seluruh pembelajaran yang telah diverifikasi menjadi bagian dari evolusi proyek.

---

# 12. HUMAN APPROVAL PRINCIPLE

Perubahan signifikan terhadap sistem harus mendapatkan persetujuan pemilik.

AI dapat:

- mengusulkan
- menganalisis
- membuat patch
- melakukan verifikasi

Keputusan akhir tetap berada pada manusia.

---

# 13. VENDOR INDEPENDENCE

Vendor hanyalah penyedia layanan.

Vendor dapat diganti.

Model AI dapat diganti.

Hosting dapat diganti.

Database dapat diganti.

Identitas Mamet AI tetap sama.

---

# 14. LONG-TERM EVOLUTION

Seluruh pengembangan Mamet AI diarahkan untuk:

- meningkatkan kualitas knowledge
- meningkatkan kualitas engineering
- meningkatkan maintainability
- meningkatkan reliability
- meningkatkan verifiability
- meningkatkan kemandirian sistem

Perubahan dilakukan secara evolusioner, bukan revolusioner.

---

# 15. END GOAL

Tujuan akhir Mamet AI adalah menjadi AI Operating System pribadi yang:

- sepenuhnya dikendalikan pemilik
- memiliki identitas sendiri
- memiliki knowledge yang terus berkembang
- memiliki memory yang terstruktur
- mampu membantu engineering secara deterministik
- tetap independen terhadap vendor maupun model AI

---

# MAEF PRINCIPLE

Bangun knowledge.

Bangun arsitektur.

Bangun pengalaman.

Bangun sistem yang dapat dipelihara.

Biarkan teknologi berubah.

Biarkan model AI berganti.

Biarkan vendor datang dan pergi.

Mamet AI tetap menjadi dirinya sendiri.

---

END OF MAEF v2.0