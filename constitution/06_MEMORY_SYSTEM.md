# 06_MEMORY_SYSTEM.md

# MEMORY SYSTEM SPECIFICATION

Versi : 1.0

Status : Core System Specification

Hierarchy : Level 1

Reference:

* Constitution
* Vision
* MAEF Kernel
* Capability Port
* Owner Sovereignty
* Knowledge System

---

# PURPOSE

Memory System adalah sistem yang mengelola kesadaran aktif Mamet Ecosystem.

Jika Knowledge adalah “apa yang benar secara jangka panjang”, maka Memory adalah:

> **apa yang sedang relevan saat ini dalam konteks Owner dan sistem**

Memory bersifat dinamis, kontekstual, dan terus berubah.

---

# KNOWLEDGE vs MEMORY

## Knowledge

* Stabil
* Terverifikasi
* Jangka panjang
* Berbasis evidence
* Berlapis (layered system)

## Memory

* Dinamis
* Kontekstual
* Sementara atau semi-permanen
* Berbasis interaksi
* Fokus pada “current relevance”

---

# MEMORY TYPES

## 1. Session Memory

Memori sementara dalam satu sesi.

Berisi:

* percakapan aktif
* konteks saat ini
* task yang sedang berjalan

Hilang atau dipadatkan setelah sesi selesai.

---

## 2. Working Memory

Memori kerja jangka pendek.

Berisi:

* task aktif
* status pekerjaan
* intermediate result
* progress saat ini

Digunakan oleh MAEF untuk eksekusi.

---

## 3. User Memory

Memori tentang Owner.

Berisi:

* preferensi
* kebiasaan
* gaya komunikasi
* workflow pribadi
* pola pengambilan keputusan

Memori ini bersifat semi-permanen.

---

## 4. Project Memory

Memori tingkat sistem untuk proyek Mamet.

Berisi:

* architecture
* ADR
* bug history
* keputusan desain
* evolution log
* engineering notes

Ini adalah “ingatan struktural” sistem.

---

## 5. System Memory

Memori internal sistem.

Berisi:

* event history
* execution state
* capability status
* health state
* error logs

---

# MEMORY LIFECYCLE

Memory tidak statis.

Lifecycle:

## 1. Create

Memory dibuat dari event atau input.

## 2. Active

Memory digunakan dalam konteks saat ini.

## 3. Updated

Memory diperbarui sesuai interaksi baru.

## 4. Compressed

Memory diringkas untuk efisiensi.

## 5. Archived

Memory disimpan untuk referensi.

## 6. Expired

Memory tidak lagi relevan.

---

# MEMORY PRIORITY SYSTEM

Tidak semua memory memiliki bobot yang sama.

Urutan prioritas:

1. User Memory (Owner-centric)
2. Working Memory
3. Session Memory
4. Project Memory
5. System Memory

---

# MEMORY AND MAEF

MAEF bertugas:

* mengelola lifecycle memory
* menghubungkan memory dengan capability
* memastikan memory relevan dengan konteks
* menjaga isolasi antar jenis memory

MAEF tidak menyimpan memory sebagai data mentah.

MAEF mengelola struktur dan aksesnya.

---

# MEMORY IS NOT KNOWLEDGE

Memory bukan fakta.

Memory adalah konteks.

Contoh:

Knowledge:
"User menyukai pendekatan modular"

Memory:
"User sedang membangun Mamet Ecosystem dengan konsep modular LEGO"

---

# CONTEXT ACTIVATION

Memory hanya aktif jika:

* relevan dengan task
* dibutuhkan oleh reasoning
* diminta oleh MAEF

Memory tidak selalu dimuat penuh.

---

# MEMORY COMPRESSION

Untuk efisiensi:

Memory dapat:

* diringkas
* di-abstract
* di-cluster
* di-index ulang

Tanpa kehilangan makna inti.

---

# OWNER CONTROL

Owner dapat:

* melihat memory
* mengubah memory
* menghapus memory
* mengunci memory
* memprioritaskan memory

---

# PRIVACY BOUNDARY

Memory tidak boleh:

* dibagikan tanpa izin Owner
* digunakan di luar konteks sistem
* dicampur dengan Knowledge tanpa validasi

---

# MEMORY VS KNOWLEDGE FLOW

Input Data
↓
MAEF Classifier
↓
Jika valid & terverifikasi → Knowledge System
Jika kontekstual & dinamis → Memory System

---

# ENGINEER ROLE

Engineer menggunakan Memory untuk:

* debugging
* analysis
* context reconstruction
* system evolution

Engineer tidak mengubah memory langsung tanpa jalur MAEF.

---

# FAILURE POLICY

Jika memory tidak konsisten:

* MAEF melakukan reconciliation
* sistem memilih memory paling relevan
* konflik dilaporkan ke Owner

---

# SUCCESS INDICATOR

Memory System berhasil jika:

* konteks selalu relevan
* tidak ada konflik besar antar memory
* sistem mampu memahami situasi secara dinamis
* Owner merasa sistem “mengerti dirinya”

---

# FINAL STATEMENT

Memory adalah kesadaran aktif Mamet Ecosystem.

Knowledge adalah kebenaran.

Memory adalah konteks.

MAEF adalah penjaga keseimbangan keduanya.

"Knowledge defines what is true. Memory defines what is relevant."
