# CHANGELOG: Implementation Preparation & Execution Plan - Engineer Workspace

**Tanggal:** 2026-07-13
**Tipe Entry:** Implementation Plan, Execution Mapping
**Status Saat Ini:** PREPARATION PHASE

Berdasarkan audit repositori terkini dan kesepakatan *Architecture Discovery* sebelumnya, berikut adalah **Implementation Mapping** untuk mengeksekusi *Engineer Workspace* secara fisik. Seluruh rencana eksekusi dikonstruksi berdasarkan prinsip risiko terendah (*Lowest Risk / Safest Path*).

## 1. Pemetaan File Frontend (UI)
Berdasarkan struktur `frontend/src`, pembuatan/modifikasi file diarahkan pada modul *core* dan *components*:
*   **File Baru (Metadata):**
    *   `frontend/src/config/workspace-engineer.json/yaml`
    *   `frontend/src/config/widgets-engineer.json/yaml`
*   **File Baru (Workspace & Parser):**
    *   `frontend/src/core/workspaces/EngineerWorkspace.jsx` (atau `.svelte` sesuai *engine* utama).
    *   `frontend/src/core/widgets/MetadataGridRenderer.jsx` (Mesin pembaca metadata).
*   **File Baru (MVP Widgets):**
    *   `frontend/src/components/widgets/WidgetCurrentTask.jsx`
    *   `frontend/src/components/widgets/WidgetApprovalCenter.jsx`
    *   `frontend/src/components/widgets/WidgetProjectMemory.jsx`
    *   `frontend/src/components/widgets/WidgetRepository.jsx`
*   **File Dimodifikasi:**
    *   `frontend/src/App.jsx` (atau komponen navigasi Sidebar utama) untuk mendaftarkan *route* `EngineerWorkspace`.

## 2. Pemetaan File Backend (MAEF Kernel)
Berdasarkan struktur `supabase/functions/agent-process/lib`, modifikasi difokuskan pada manajemen *state* dan distribusi *stream*.
*   **File Dimodifikasi:**
    *   `lib/runtime_context.ts`: Menginjeksi `EngineeringState` ke dalam *global context*.
    *   `lib/maef/engineering_lifecycle.ts` (Atau entitas baru): Realisasi kode fisik dari RFC-014 untuk merespons instruksi `ENGINEER:APPROVE` dan mengubah status fase.
    *   `lib/stream_handler.ts`: Memastikan pergantian fase memancarkan *event Server-Sent Events* (SSE) ke klien.
    *   `lib/event/event_bus.ts`: Mendaftarkan tipe event `EngineeringLifecycle.PhaseChanged`.

## 3. Struktur Folder Final (Engineer Workspace)
Untuk menjaga arsitektur tetap bersih (*Modular Design*), hierarki UI spesifik dikelompokkan sebagai berikut:
```text
frontend/src/
 ├── config/
 │    └── metadata/                 # Sumber kebenaran UI (Macro-metadata)
 │         ├── workspace-engineer.yaml
 │         └── widgets-engineer.yaml
 ├── core/
 │    └── workspaces/
 │         ├── EngineerWorkspace.jsx # Kontainer utama
 │         └── MetadataGridRenderer.jsx # Parser
 └── components/
      └── widgets/                  # Komponen fisik mandatori
           ├── WidgetCurrentTask.jsx
           ├── WidgetApprovalCenter.jsx
           ├── WidgetProjectMemory.jsx
           └── WidgetRepository.jsx
```

## 4. Peta Dependensi (Dependencies & Data Flow)
*   **Supabase (Database):** Widget *Project Memory* terikat pada tabel `project_memory_entries` (Data bersifat statis, *fetch-on-load* atau *realtime-subscription* via Supabase Client `supabase.js`).
*   **Event Bus (Backend):** Mesin internal yang me-*routing* intent `ENGINEER:APPROVE` ke dalam `EngineeringLifecycleManager`.
*   **SSE / Server-Sent Events (Jembatan):** Nadi utama kelangsungan *workspace*. SSE wajib aktif karena widget *Current Task* berlangganan (*subscribe*) langsung pada pergeseran *state* dari *backend* tanpa perlu *polling*.

## 5. Safest Execution Plan (Urutan Implementasi)
Urutan dieksekusi dengan isolasi risiko tinggi, memastikan aplikasi eksisting tidak rusak (*breaking changes*).

1.  **Step 1: The Contract (Zero Risk)**
    *   Buat `workspace-engineer.yaml` dan `widgets-engineer.yaml`. Tidak ada kode yang diubah.
2.  **Step 2: The Backend State (Low Risk)**
    *   Implementasikan `EngineeringLifecycleManager` di `lib/maef/`. Pastikan unit ini memancarkan event ke `Event Bus`. 
3.  **Step 3: The Data Bridge (Medium Risk)**
    *   Modifikasi `stream_handler.ts` agar *event* internal (Phase Changed) diteruskan ke SSE *Stream* klien.
4.  **Step 4: The Static UI (Low Risk)**
    *   Buat `EngineerWorkspace` dan 4 *Widget statis* di *frontend*. Pasang *parser* pembaca metadata. (UI belum bisa diklik).
5.  **Step 5: The Wiring (High Risk - Final Step)**
    *   Hubungkan *Approval Center* dengan tombol *trigger* `ENGINEER:APPROVE`.
    *   Aktifkan pendaftaran menu *Engineer* di Sidebar agar dapat diakses pengguna.

**Kesimpulan:** Dokumen ini resmi mengakhiri fase observasi. Repositori siap untuk injeksi kode aktual berdasarkan *Execution Plan* di atas jika persetujuan *Owner* diberikan.
