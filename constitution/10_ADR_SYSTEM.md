# 10_ADR_SYSTEM.md

# ARCHITECTURE DECISION RECORD (ADR) SYSTEM

Versi : 1.0

Status : Engineering Specification

Hierarchy : Level 2

Reference:

* Constitution
* Vision
* MAEF Kernel
* Capability Port
* Owner Sovereignty
* Knowledge System
* Memory System
* Engineering System
* Roadmap
* DNA

---

# PURPOSE

ADR System adalah sistem pencatatan keputusan arsitektur dalam Mamet Ecosystem.

Setiap keputusan penting harus dicatat agar:

* dapat dilacak
* dapat dievaluasi
* tidak hilang seiring waktu
* tidak diulang tanpa alasan
* tetap konsisten dengan evolusi sistem

---

# WHY ADR EXISTS

Tanpa ADR:

* keputusan arsitektur hilang
* perubahan tidak bisa dijelaskan
* sistem menjadi tidak konsisten
* engineer baru tidak memahami alasan desain
* MAEF kehilangan konteks historis

Dengan ADR:

* semua keputusan memiliki jejak
* evolusi sistem dapat ditelusuri
* alasan desain tetap hidup

---

# ADR PRINCIPLE

Setiap ADR harus menjawab:

* Apa keputusan yang dibuat?
* Kenapa keputusan itu dibuat?
* Alternatif apa yang ditolak?
* Dampaknya terhadap sistem?
* Risiko dari keputusan tersebut?

---

# ADR STRUCTURE

Setiap ADR wajib memiliki format:

## 1. ID

Contoh: ADR-0001

## 2. Title

Nama keputusan

## 3. Status

* Proposed
* Accepted
* Deprecated
* Superseded

## 4. Context

Latar belakang masalah

## 5. Decision

Keputusan yang diambil

## 6. Alternatives

Pilihan lain yang dipertimbangkan

## 7. Consequences

Dampak keputusan

## 8. Impact Scope

Bagian sistem yang terdampak

## 9. Related Components

MAEF / Knowledge / Memory / Capability / dll

---

# ADR LIFECYCLE

## 1. Proposed

Keputusan masih dalam diskusi

## 2. Accepted

Keputusan diterima dan diimplementasikan

## 3. Deprecated

Keputusan tidak lagi digunakan

## 4. Superseded

Digantikan oleh ADR baru

---

# ADR AND MAEF

MAEF menggunakan ADR untuk:

* memahami sejarah keputusan
* melakukan reasoning arsitektural
* menghindari konflik desain
* menjaga konsistensi sistem

---

# ADR AND ENGINEERING SYSTEM

Engineering System wajib:

* membaca ADR sebelum membuat perubahan
* menulis ADR untuk setiap perubahan besar
* memperbarui ADR saat sistem berevolusi

---

# ADR AND KNOWLEDGE SYSTEM

ADR adalah bagian dari:

> Engineering Knowledge

Namun berbeda dari Knowledge umum karena:

* bersifat preskriptif (mengatur desain)
* bukan deskriptif (menjelaskan fakta)

---

# ADR SCOPE RULE

ADR wajib dibuat jika:

* mengubah MAEF Kernel
* menambah Capability Port baru
* mengubah Memory System struktur
* mengubah Knowledge lifecycle
* mengubah governance rules
* mengubah architecture utama

ADR tidak wajib jika:

* bug kecil
* perubahan UI
* refactor lokal tanpa dampak sistem

---

# VERSIONING RULE

Setiap perubahan signifikan harus:

* membuat ADR baru
* tidak menghapus ADR lama
* menjaga sejarah tetap utuh

---

# DECISION TRACEABILITY

Setiap sistem dalam Mamet Ecosystem harus bisa ditelusuri ke:

Owner Intent
↓
MAEF Execution
↓
ADR Reference
↓
Implementation

---

# NON GOALS

ADR System bukan:

* task tracker
* bug tracker
* documentation umum
* chat log

ADR hanya mencatat keputusan arsitektur.

---

# FAILURE CONDITION

Sistem dianggap gagal jika:

* keputusan arsitektur tidak tercatat
* perubahan dilakukan tanpa ADR
* tidak ada traceability ke keputusan awal
* MAEF kehilangan konteks desain

---

# SUCCESS INDICATOR

ADR System berhasil jika:

* setiap keputusan besar dapat ditelusuri
* engineer baru memahami sejarah sistem
* MAEF dapat menggunakan ADR untuk reasoning
* tidak ada konflik arsitektur tanpa penjelasan

---

# FINAL STATEMENT

ADR adalah memori struktural Mamet Ecosystem.

Jika Knowledge adalah “apa yang diketahui”,

maka ADR adalah:

> **"kenapa sistem dibuat seperti itu"**

Tanpa ADR, sistem kehilangan sejarah.

Tanpa sejarah, sistem kehilangan arah.
