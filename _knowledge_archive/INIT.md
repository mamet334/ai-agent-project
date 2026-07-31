# 🗺️ INIT.md - MAMET ECOSYSTEM MASTER INDEX

## 📌 1. DIREKTIF UTAMA (Wajib dipatuhi AI/Engineer)
Proyek ini memiliki **24 dokumen di folder `constitution/`** dan beberapa dokumen di root.
Anda **TIDAK DIIZINKAN** membaca seluruh 24 dokumen sekaligus. 
1. Identifikasi tugas Anda berdasarkan **Peta Navigasi Tugas (Poin 4)**.
2. **HANYA** buka dokumen yang ditunjuk di folder `constitution/`.
3. Jangan membuka folder `src/` atau menulis kode sebelum dokumen tersebut selesai Anda baca.
4. Jika tugas Anda tidak tercantum dalam tabel, Anda WAJIB melapor ke Owner dan tidak menebak-nebak.

---

## 📂 2. INDEKS LENGKAP CONSTITUTION (24 Dokumen) & ROOT
*(Referensi struktur file asli di GitHub)*

**Root Dokumen Filosofi:** `README.md`, `AGENTS.md`, `NORTH_STAR.md`, `OWNER_MANIFESTO.md`, `DESIGN_PHILOSOPHY.md`, `MENTAL_MODEL.md`.
**Root Panduan Teknis:** `docs/adr/ADR-0011.md` (Project Memory Canonical Source).

| Level | Path File Constitution (di `/constitution/`) | Fungsi Inti |
| :--- | :--- | :--- |
| **0** | `00_CONSTITUTION.md` | Dokumen tertinggi. Filosofi, tata kelola, dan level dokumen. |
| **1** | `01_VISION.md` | Arah jangka panjang. AI sebagai Capability, Knowledge sebagai Aset. |
| **1** | `02_MAEF_KERNEL.md` | Kernel sistem, Lifecycle, Event, Identity. |
| **1** | `03_CAPABILITY_PORT.md` | Definisi interface Port (Reasoning, Knowledge, Memory). |
| **1** | `04_OWNER_SOVEREIGNTY.md` | Kedaulatan Owner. Sumber Identitas, Tujuan, dan Batasan. |
| **1** | `05_KNOWLEDGE_SYSTEM.md` | Sistem pengetahuan jangka panjang (Verifikasi, Evidence). |
| **1** | `06_MEMORY_SYSTEM.md` | Sistem konteks dinamis (Session, Working, User, Project). |
| **1** | `07_ENGINEERING_SYSTEM.md` | Proses pengembangan, Root Cause, & Self-healing. |
| **1** | `08_ROADMAP.md` | Peta jalan evolusi sistem (8 Fase menuju kemandirian). |
| **1** | `09_DNA.md` | Identitas inti sistem yang tidak bisa diubah. |
| **2** | `10_ADR_SYSTEM.md` | Aturan pembuatan ADR (mencatat keputusan arsitektur). |
| **2** | `11_MAEF_EVENT_SYSTEM.md` | Sistem komunikasi Event antar komponen. |
| **2** | `12_CAPABILITY_ADAPTER_SPEC.md` | Spesifikasi teknis Adapter (Translasi vendor). |
| **2** | `13_VERIFICATION_ENGINE_SPEC.md` | Mesin verifikasi (Confidence Score & Filter Kebenaran). |
| **2** | `14_MAEF_ORCHESTRATOR_SPEC.md` | Mesin eksekusi (Intent → Task → Execution → Result). |
| **2** | `15_LOGGING_OBSERVABILITY_SYSTEM.md` | Pencatatan log, tracing, dan pemantauan real-time. |
| **2** | `16_ENGINEERING_METRICS_SYSTEM.md` | Metrik kesehatan sistem (System Health Index / SHI). |
| **2** | `17_MAEF_BOOTSTRAP_SYSTEM.md` | Mekanisme startup (Zero State ke Active dalam 10 Fase). |
| **2** | `18_DEPLOYMENT_ARCHITECTURE.md` | Infrastruktur runtime (Local, Cloud, Hybrid). |
| **2** | `19_REFERENCE_IMPLEMENTATION.md` | Contoh implementasi kode nyata. |
| **3** | `20_ENGINEERING_POLICY.md` | Kebijakan operasional, izin Engineer (Default Deny, Least Privilege). |
| **3** | `21_Engineer_Capability.md` | Kemampuan, batasan, dan tanggung jawab Engineer. |
| **3** | `22_MUS_UI_SPECIFICATION.md` | Spesifikasi tampilan dashboard dan Workspace (Metadata-Driven). |
| **3** | `ENGINEERING_CONTRACT.md` | Kontrak teknis mengikat antara MAEF dan Engineer. |

---

## 🧭 3. PETA NAVIGASI TUGAS (Trigger → Buka Constitution Asli)
*(Gunakan tabel ini untuk memfilter dokumen agar AI tidak noise).*

| 🔹 **Jenis Tugas AI/Engineer** | 🎯 **Dokumen Wajib Dibuka (Path Asli)** |
| :--- | :--- |
| **Memahami Arah Sistem / Filosofi Owner** | `constitution/00_CONSTITUTION.md` + `constitution/01_VISION.md` + `constitution/04_OWNER_SOVEREIGNTY.md` |
| **Buat / Ganti Capability (Modul/Adapter)** | `constitution/03_CAPABILITY_PORT.md` + `constitution/12_CAPABILITY_ADAPTER_SPEC.md` |
| **Membuat Alur Eksekusi / Workflow** | `constitution/14_MAEF_ORCHESTRATOR_SPEC.md` + `constitution/11_MAEF_EVENT_SYSTEM.md` |
| **Menulis Skema DB / Menyimpan Data** | `constitution/06_MEMORY_SYSTEM.md` + `docs/adr/ADR-0011.md` |
| **Validasi Output / Cegah Halusinasi** | `constitution/13_VERIFICATION_ENGINE_SPEC.md` |
| **Memulai Sistem / Inisialisasi** | `constitution/17_MAEF_BOOTSTRAP_SYSTEM.md` (Ikuti 10 Fase!) |
| **Debugging / Analisis Root Cause** | `constitution/07_ENGINEERING_SYSTEM.md` + `constitution/15_LOGGING_OBSERVABILITY_SYSTEM.md` |
| **Membuat Logging / Observability** | `constitution/15_LOGGING_OBSERVABILITY_SYSTEM.md` |
| **Mengukur Kinerja / Metrics (SHI)** | `constitution/16_ENGINEERING_METRICS_SYSTEM.md` |
| **Membuat Dashboard / UI / Workspace** | `constitution/22_MUS_UI_SPECIFICATION.md` (Wajib metadata-driven) |
| **Membuat Keputusan Arsitektur Baru** | `constitution/10_ADR_SYSTEM.md` (Tulis ADR dulu!) |
| **Deployment / Infrastruktur** | `constitution/18_DEPLOYMENT_ARCHITECTURE.md` (Jangan terkunci vendor) |
| **Memahami Batasan & Izin Engineer** | `constitution/20_ENGINEERING_POLICY.md` + `constitution/21_Engineer_Capability.md` |

---

## ⚙️ 4. BUKU SAKU TEKNIS EKSEKUTIF (Hafalan Wajib)
*(Jika butuh detail, buka file aslinya).*

**A. Struktur Event (Dari `11_EVENT`):**
`{ event_id, event_type, timestamp, source, payload, context, trace_id }`. Harus lewat `Event Bus`.

**B. Siklus Hidup Sistem (Dari `17_BOOTSTRAP`):**
Fase 0→1→2(Event)→3→4→5→6→7→8→9→10(Active).

**C. Format Log (Dari `15_LOGGING`):**
`{ timestamp, level (INFO/WARN/ERROR/DEBUG), source, event_type, message, trace_id, metadata }`.

**D. System Health Index (Dari `16_METRICS`):**
SHI 0.0 - 1.0. `< 0.3` = Critical, `> 0.8` = Optimal.

**E. Desain UI (Dari `22_MUS`):**
Wajib `metadata-driven` (`workspace.yaml`). Jangan *hardcode*.

**F. Deployment (Dari `18_DEPLOYMENT`):**
Core **immutable**. Harus ada endpoint `/health`, `/metrics`, `/status`.

**G. ADR Rule (Dari `10_ADR`):**
Setiap perubahan arsitektur WAJIB buat ADR baru. Jangan hapus ADR lama.

**H. DNA & Filosofi (Dari `09_DNA`):**
*Owner adalah pusat. MAEF adalah kernel. Capability bisa diganti. Vendor bukan identitas.*

---

## 🚫 5. LARANGAN MUTLAK (Pelanggaran = Hentikan Tugas & Laporkan Owner)
1. **DILARANG** buat *patch* instan tanpa cari Root Cause (`07_ENGINEERING`).
2. **DILARANG** panggil OpenAI/Google langsung tanpa `Adapter Layer`.
3. **DILARANG** edit `docs/project-memory/*.md` manual. Fakta harus lewat DB (`ADR-0011`).
4. **DILARANG** ubah `00_CONSTITUTION.md`, `01_VISION.md`, `09_DNA.md`, atau `AGENTS.md` tanpa persetujuan Owner.
5. **DILARANG** ubah/hapus Log/Metrics (Sistem jadi buta).
6. **DILARANG** mengambil keputusan akhir atas nama Owner.