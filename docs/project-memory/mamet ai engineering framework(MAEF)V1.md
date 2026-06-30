# MAMET AI ENGINEERING FRAMEWORK (MAEF)

Version: 1.0.0
Status: FINAL BASELINE
Type: Constitution
Owner: Mamet AI Project

---

# 1. PURPOSE

MAEF adalah konstitusi utama seluruh ekosistem Mamet AI.

Dokumen ini menjadi sumber aturan tertinggi yang mengatur seluruh:

* arsitektur
* pengembangan
* workflow
* data
* AI behavior
* repository
* deployment

Tidak ada sistem, modul, atau AI yang berada di atas MAEF.

---

# 2. CORE VISION

Mamet AI adalah **AI Operating System pribadi** yang:

* dimiliki penuh oleh user
* tidak bergantung pada vendor tunggal
* tidak bergantung pada model AI tertentu
* memiliki knowledge internal sendiri
* memiliki memory internal sendiri
* dapat berevolusi secara sistematis

---

# 3. SCOPE

MAEF berlaku untuk seluruh sistem:

* Mamet Assistant
* MametLite
* Mamet Engineer
* Knowledge System
* User Memory System
* Project Memory System
* Shared Services Layer
* AI Orchestrator
* API Layer
* Database Layer
* Repository
* Deployment System

---

# 4. CORE PRINCIPLES

## 4.1 Full Custom Control

Seluruh kontrol sistem berada di tangan pemilik proyek.

AI hanya alat bantu analisis dan eksekusi terbatas.

---

## 4.2 Knowledge First

Knowledge adalah aset utama.

Source code hanya implementasi dari knowledge.

---

## 4.3 Documentation First

Tidak ada implementasi tanpa dokumentasi.

---

## 4.4 Architecture First

Arsitektur selalu lebih tinggi dari kode.

Repository mengikuti arsitektur, bukan sebaliknya.

---

## 4.5 Evolution Principle

Sistem harus mampu berkembang tanpa merusak struktur inti.

---

# 5. SINGLE SOURCE OF TRUTH

Urutan otoritas sistem:

1. MAEF
2. Vision
3. Master Architecture Index
4. System Architecture
5. ADR (Architecture Decision Record)
6. Technical Specification
7. Development Standard
8. Engineering Blueprint
9. Roadmap
10. Repository
11. Runtime System

Jika terjadi konflik, level tertinggi menang.

---

# 6. REPOSITORY PRINCIPLE

Repository adalah:

* implementasi
* bukan sumber kebenaran
* dapat berubah
* harus mengikuti MAEF

---

# 7. ARCHITECTURE GAP PRINCIPLE

Semua perbedaan antara:

* MAEF
* Architecture
* Repository
* Implementation

disebut **Architecture Gap**

Rules:

* Gap wajib dilaporkan
* Gap tidak boleh langsung diperbaiki tanpa Task
* Gap harus dianalisis terlebih dahulu

---

# 8. AI GOVERNANCE

## AI Boleh:

* Analisis sistem
* Audit kode
* Menyusun task
* Menyusun dokumentasi
* Membantu debugging

## AI Tidak Boleh:

* Mengubah MAEF
* Mengubah tujuan proyek
* Mengubah arsitektur tanpa ADR
* Mengubah repository tanpa task
* Mengambil keputusan final sistem

---

# 9. ENGINEERING RULES

Semua perubahan harus:

* memiliki tujuan jelas
* memiliki dokumentasi
* memiliki task
* melalui proses analisis
* melewati testing

Tidak ada perubahan langsung ke sistem tanpa proses.

---

# 10. CAPABILITY MODEL

## Assistant

* Interaksi pengguna
* Menggunakan knowledge + memory
* Tidak mengubah sistem

## MametLite

* Mode cepat
* Read-oriented
* Ringan dan efisien

## Mamet Engineer

* Analisis sistem
* Debugging
* Refactoring
* Implementasi
* Project Memory management

---

# 11. SHARED SERVICES

Berisi:

* Knowledge System
* User Memory
* Project Memory
* Authentication
* Logging
* Configuration

Semua capability mengakses layer ini.

---

# 12. KNOWLEDGE SYSTEM

Knowledge terbagi:

* External Knowledge
* Internal Knowledge
* User Knowledge
* Engineering Knowledge

Knowledge harus terus berkembang dan terstruktur.

---

# 13. PROJECT MEMORY

Project Memory menyimpan:

* Bug
* Root cause
* Solution
* Lessons learned
* ADR terkait
* Breaking change
* Performance insight

---

# 14. ENGINEERING FLOW

Vision
→ Architecture
→ ADR
→ Technical Spec
→ Task
→ Implementation
→ Testing
→ Project Memory
→ Release

Tidak boleh dilewati.

---

# 15. GOVERNANCE RULE

Perubahan sistem harus:

* didokumentasikan
* disetujui
* memiliki jejak keputusan
* tidak langsung mengubah sistem produksi

---

# 16. FINAL GOAL

Mamet AI bertujuan menjadi:

* AI Operating System pribadi
* fully controllable system
* vendor independent
* model independent
* self-evolving knowledge system
* structured memory system
* long-term sustainable architecture

---

# END OF MAEF v1.0
