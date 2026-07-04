# MAEF UI SPECIFICATION (MUS)

Version      : 1.0
Status       : ACTIVE
Document Type: UI Architecture Specification
Authority    : Derived from MAEF Constitution
Owner        : Mamet Ecosystem

---

# 1. PURPOSE

MUS (MAEF UI Specification) adalah standar resmi yang mendefinisikan arsitektur antarmuka (User Interface) pada seluruh Mamet Ecosystem.

MUS memastikan bahwa seluruh tampilan sistem merupakan representasi langsung dari Architecture, Capability, dan System State yang dikelola oleh MAEF Kernel.

UI bukan sumber kebenaran.

UI adalah representasi visual dari keadaan sistem.

Seluruh implementasi antarmuka wajib mengikuti MUS.

Tidak ada implementasi UI yang memiliki otoritas lebih tinggi daripada MUS.

---

# 2. CORE VISION

Mamet UI dibangun untuk membantu Owner memahami kondisi sistem dalam sekali lihat.

Dashboard bukan sekadar tampilan visual.

Dashboard adalah jendela yang memperlihatkan keadaan aktual Mamet Ecosystem.

Setiap informasi yang ditampilkan harus berasal dari data yang dapat diverifikasi.

---

# 3. SCOPE

MUS berlaku untuk seluruh antarmuka Mamet Ecosystem, termasuk namun tidak terbatas pada:

* Dashboard
* Workspace
* Sidebar
* Navigation
* Widget
* System Status
* Event Stream
* Memory View
* Verification View
* Approval Center
* Project View
* Engineering View
* Future Capability Workspace

---

# 4. CORE PRINCIPLES

## 4.1 Architecture Driven UI

Seluruh UI dibangun berdasarkan Architecture.

UI tidak boleh menjadi acuan Architecture.

Architecture selalu menjadi sumber utama.

---

## 4.2 State Driven UI

Seluruh tampilan harus berasal dari System State.

UI tidak boleh menampilkan informasi yang tidak berasal dari sistem.

AI tidak diperbolehkan membuat informasi sendiri.

---

## 4.3 Capability Driven UI

Widget hanya boleh muncul apabila Capability tersedia.

Capability menentukan apa yang boleh ditampilkan.

---

## 4.4 Workspace Isolation

Setiap Workspace memiliki fungsi yang berbeda.

Capability tidak boleh saling bercampur.

Workspace hanya menampilkan informasi yang relevan terhadap tujuannya.

---

## 4.5 Owner First

UI dibuat untuk membantu Owner mengambil keputusan.

Dashboard tidak dibuat untuk memamerkan teknologi.

Dashboard dibuat agar Owner memahami kondisi sistem dengan cepat.

---

## 4.6 Simplicity First

Dashboard harus sederhana.

Informasi yang penting harus lebih mudah terlihat dibanding informasi teknis.

---

## 4.7 Documentation First

Seluruh komponen UI harus memiliki dokumentasi.

Tidak boleh ada Widget yang tidak memiliki definisi.

---

# 5. UI ARCHITECTURE

Hierarki UI mengikuti Architecture Mamet.

```
MAEF Constitution
        │
Master Architecture
        │
System Architecture
        │
Capability
        │
Kernel State
        │
UI State
        │
Widget
        │
Dashboard
```

UI tidak boleh melewati Kernel.

---

# 6. WORKSPACE

Workspace merupakan pintu masuk utama seluruh aktivitas pengguna.

Workspace resmi Mamet Ecosystem:

* Mamet Assistant
* MametLite
* Mamet Engineer

Workspace baru dapat ditambahkan tanpa mengubah Workspace yang sudah ada.

---

# 7. HOME DASHBOARD

Home Dashboard berfungsi sebagai ringkasan kondisi sistem.

Widget wajib:

* Workspace Overview
* System Status
* Current Activity
* Recent Events
* Pending Approval
* Verification Summary

Home tidak menampilkan detail teknis.

---

# 8. MAMET ASSISTANT

Tujuan:

Asisten pribadi untuk aktivitas sehari-hari.

Widget utama:

* Conversation
* Current Session
* Recent Memory
* Knowledge Used
* Suggested Actions

Widget berikut tidak boleh muncul:

* Repository
* Git
* Technical Debt
* Architecture Gap
* ADR

---

# 9. MAMETLITE

Tujuan:

Mode ringan dengan respon cepat dan biaya rendah.

Widget utama:

* Quick Search
* Quick Chat
* Recent Search
* Current Model
* Token Usage
* Latency

MametLite tidak memuat:

* Heavy RAG
* Repository
* Project Memory
* Verification Detail

---

# 10. MAMET ENGINEER

Tujuan:

Engineering Brain Mamet Ecosystem.

Widget utama:

* Repository
* Current Task
* Verification
* Project Memory
* Architecture
* Technical Debt
* Architecture Gap
* Lessons Learned
* Approval Center

---

# 11. SHARED SIDEBAR

Sidebar memiliki struktur tetap.

```
Home

Workspace
    Assistant
    MametLite
    Engineer

Knowledge
Memory
Project

Verification

Event Stream

Kernel

Settings
```

Isi Sidebar dapat berubah sesuai Workspace.

Struktur utama tidak berubah.

---

# 12. SYSTEM STATUS

Dashboard wajib menampilkan status komponen utama.

Minimal meliputi:

* MAEF Kernel
* Verification Engine
* Memory Service
* Event Bus
* Adapter Layer
* Reasoning Engine

Status standar:

* Healthy
* Warning
* Error

---

# 13. EVENT STREAM

Seluruh aktivitas sistem berasal dari Event Bus.

Format standar:

```
Timestamp

Event

Source

Status
```

Contoh:

```
10:24

Intent.Received

Assistant

Success
```

---

# 14. MEMORY OVERVIEW

Dashboard hanya menampilkan ringkasan Memory.

Jenis Memory:

* User Memory
* Knowledge Memory
* Project Memory
* Decision History
* Verification History
* Lessons Learned

---

# 15. APPROVAL CENTER

Seluruh perubahan yang membutuhkan persetujuan Owner muncul di Approval Center.

Status:

* Pending
* Approved
* Rejected

Tidak boleh ada perubahan sistem tanpa Approval Owner.

---

# 16. WIDGET SPECIFICATION

Seluruh Widget wajib memiliki metadata.

Minimal:

* Widget ID
* Title
* Workspace
* Capability
* Source
* Priority
* Refresh Policy
* Visibility

Widget tidak boleh dibuat tanpa metadata.

---

# 17. CAPABILITY → UI MAPPING

Capability menentukan Widget.

Contoh:

Verification

↓

Verification Summary

↓

Verification Detail

↓

Verification History

Dashboard tidak boleh menampilkan Widget yang tidak memiliki Capability.

---

# 18. SYSTEM STATE

Dashboard membaca Kernel State.

Contoh:

```
Workspace

↓

Current Task

↓

Verification

↓

Approval

↓

Dashboard
```

Perubahan State harus langsung tercermin pada UI.

---

# 19. DESIGN PRINCIPLES

UI harus:

* sederhana
* konsisten
* mudah dipahami
* minim distraksi
* responsif
* modular
* scalable
* mudah dikembangkan

---

# 20. UI GOVERNANCE

Seluruh perubahan UI wajib memiliki:

* tujuan
* ruang lingkup
* dokumentasi
* analisis
* alasan
* persetujuan Owner

Tidak boleh ada perubahan UI yang bertentangan dengan MAEF.

---

# 21. METADATA DRIVEN UI

MUS tidak menyimpan struktur layout secara hardcode.

MUS hanya mendefinisikan aturan, prinsip, dan tata kelola UI.

Seluruh implementasi Dashboard harus dibangun berdasarkan metadata yang dapat dibaca oleh MAEF Kernel.

Metadata minimal terdiri dari:

* workspace.yaml
* widgets.yaml
* navigation.yaml
* capabilities.yaml

Metadata menjadi sumber informasi bagi AI untuk membangun tampilan secara konsisten.

Dengan pendekatan ini:

* penambahan Workspace baru tidak memerlukan perubahan logika UI
* penambahan Capability baru tidak memerlukan perubahan Dashboard secara manual
* AI hanya membaca metadata yang tersedia
* seluruh tampilan tetap mengikuti MUS

Contoh Workspace yang dapat ditambahkan di masa depan:

* Automation
* Vision
* IoT
* Robotics
* Developer
* Security
* Analytics

Semua Workspace baru tetap mengikuti MUS tanpa mengubah arsitektur yang sudah ada.

Pendekatan ini mendukung prinsip:

* Documentation First
* Architecture First
* Evolution Without Chaos

---

# 22. LONG-TERM EVOLUTION

UI Mamet Ecosystem harus mampu berkembang tanpa kehilangan identitas.

Perubahan dilakukan secara evolusioner.

Dashboard harus mampu beradaptasi terhadap:

* Capability baru
* Workspace baru
* Kernel baru
* Vendor baru
* LLM baru

tanpa mengubah prinsip dasar MUS.

---

# 23. MUS PRINCIPLE

Bangun Architecture.

Bangun Capability.

Bangun Metadata.

Bangun Dashboard.

Biarkan tampilan mengikuti State.

Biarkan Capability berkembang.

Biarkan Workspace bertambah.

Biarkan teknologi berubah.

Biarkan vendor berganti.

UI tetap konsisten.

MAEF tetap menjadi inti.

Owner tetap menjadi pengendali.

END OF MUS v1.0
