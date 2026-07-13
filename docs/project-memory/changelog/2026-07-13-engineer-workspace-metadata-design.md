# CHANGELOG: Metadata Design - Engineer Workspace

**Tanggal:** 2026-07-13
**Tipe Entry:** Architecture Design, Metadata Specification
**Status Saat Ini:** DESIGN COMPLETE, METADATA READY FOR IMPLEMENTATION

Sesuai instruksi dan panduan `22_MUS_UI_SPECIFICATION.md`, fase desain metadata (*Metadata-Driven UI*) untuk *Engineer Workspace* telah dirumuskan. Desain ini memastikan fondasi antarmuka Svelte kelak dapat dikonfigurasi melalui *backend* tanpa *hardcode* komponen layout.

## 1. Struktur Minimum `workspace-engineer.yaml`
Berkas ini bertugas mendaftarkan eksistensi *Engineer Workspace* ke dalam menu navigasi dan mesin *router* aplikasi.

```yaml
workspace:
  id: "workspace-engineer"
  title: "Mamet Engineer"
  description: "Engineering Brain of Mamet Ecosystem"
  icon: "engineer-icon"      # Referensi aset statis (frontend)
  layout_type: "bento-grid"  # Macro-layout engine
  capabilities_required: 
    - "ENGINEERING_SYSTEM"
    - "PROJECT_MEMORY_ACCESS"
```

## 2. Struktur Minimum `widgets-engineer.yaml`
Sesuai Konstitusi 22, setiap definisi widget wajib memuat setidaknya 8 pilar metadata.

```yaml
# Contoh Definisi Struktur
widgets:
  - id: "widget-approval-center"
    title: "Approval Center"
    workspace: "workspace-engineer"
    capability: "LIFECYCLE_CONTROL"     # Hak yang dibutuhkan untuk interaksi
    source: "event_bus:lifecycle"       # Endpoint / Stream asal data
    priority: 1                         # Urutan render (1 = Teratas)
    refresh_policy: "realtime-sse"      # Metode pembaruan (sse vs polling)
    visibility: "owner_only"            # Aturan akses
```

## 3. Capability Requirement untuk 9 Widget Mandatori
Setiap widget dipetakan ke *Capability* spesifik yang diatur oleh `Permission Engine` (Konstitusi 20 & 21).

| Widget ID | Nama Widget | Syarat Kapabilitas (*Capability*) |
| :--- | :--- | :--- |
| `widget-repo` | Repository | `FILE_SYSTEM_READ` |
| `widget-task` | Current Task | `LIFECYCLE_READ` |
| `widget-approval` | Approval Center | `LIFECYCLE_CONTROL` |
| `widget-verification`| Verification | `VERIFICATION_ENGINE` |
| `widget-proj-mem` | Project Memory | `PROJECT_MEMORY_ACCESS` |
| `widget-architecture`| Architecture | `KNOWLEDGE_ACCESS` |
| `widget-tech-debt` | Technical Debt | `ENGINEERING_METRICS` |
| `widget-arch-gap` | Architecture Gap | `ENGINEERING_METRICS` |
| `widget-lessons` | Lessons Learned | `PROJECT_MEMORY_ACCESS` |

## 4. Prioritas MVP (Minimum Viable Product)
Untuk fase implementasi selanjutnya, direkomendasikan untuk tidak membangun ke-9 widget secara bersamaan guna mempercepat iterasi. 

**Top 4 MVP Widget yang akan dieksekusi pertama:**
1.  **Current Task (`widget-task`):** Prioritas absolut untuk memvisualisasikan status *Self Engineering Lifecycle* (RFC-014).
2.  **Approval Center (`widget-approval`):** Sentral kedaulatan Owner (memungkinkan pengiriman injeksi `ENGINEER:APPROVE`).
3.  **Project Memory (`widget-proj-mem`):** Integrasi *read-only* pertama ke database `project_memory_entries` (ADR-0011).
4.  **Repository (`widget-repo`):** Menampilkan konteks operasional agen saat ini secara visual.

## 5. Keputusan & Batasan
*   Desain struktur file `.yaml` ini merupakan spesifikasi murni (kontrak data).
*   Tidak ada *source code frontend/backend* yang diproduksi hari ini.
*   *Frontend builder* diizinkan untuk membangun parser YAML ini pada iterasi pengembangan *frontend* berikutnya.
