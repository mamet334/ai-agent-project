# RFC-015: Single Tool Dispatcher (Execution Guard Bridge)

## 1. Latar Belakang & Architecture Gap (GAP-NEW-019)
Implementasi RFC-014 (Self Engineering Lifecycle) mengandalkan *Pre-flight Tool Filter* untuk menyembunyikan alat dari LLM saat tidak diizinkan. Namun, arsitektur saat ini memiliki celah (*execution bypass*) di mana eksekusi alat dan sub-agent berjalan di jalur yang tersebar (*decentralized*). Jika LLM menghalusinasi pemanggilan fungsi, atau jika sub-agent bertindak di luar kendali, tidak ada satu titik (*choke point*) yang dapat memblokir eksekusi tersebut secara absolut.

## 2. Threat Model & Kemungkinan Bypass
Berikut adalah daftar kelemahan (*threat model*) pada jalur eksekusi saat ini:
1. **Desktop Tool Hallucination:** LLM merespons dengan JSON *Function Call* untuk `replace_file_content` (meskipun disembunyikan di prompt). Karena backend (`stream_handler.ts`) hanya menyalurkan *stream* langsung ke *Svelte Desktop*, Desktop akan langsung mengeksekusi perubahan file. Guardrail backend berhasil di-bypass.
2. **Terminal Tag Injection:** LLM menggunakan tag `<terminal>rm -rf src</terminal>`. Desktop akan langsung menjalankannya tanpa pemeriksaan *State Machine* backend.
3. **Subagent Rogue Execution:** Sebuah plugin (misal `coder`) memanggil API atau fungsi berbahaya dari dalam `tool_subscriber.ts` tanpa pernah divalidasi oleh `EngineeringLifecycleManager`.
4. **Client API Manipulation:** Modifikasi request melalui DevTools yang mengirimkan payload fiktif.

## 3. Daftar Seluruh Jalur Eksekusi Tool Saat Ini (As-Is)
*   **Jalur 1 (Subagent):** `ExecutionPlannerHandler` → Event Bus `Tool.Requested` → `tool_subscriber.ts` → `plugin.execute()`
*   **Jalur 2 (Desktop Function Calling):** `LLM Adapter` → `stream_handler.ts` (SSE) → Svelte Desktop UI → `fs` / `npx` / `terminal`.
*   **Jalur 3 (Terminal Tags):** Prompt `<terminal>` di-*inject* oleh `llm_orchestrator.ts` → Svelte UI mengeksekusi command.

## 4. Arsitektur ToolDispatcher (To-Be)
Semua eksekusi wajib melalui antarmuka tunggal: `ToolDispatcher.execute()`. 
*   **Subagent:** `tool_subscriber.ts` tidak lagi memanggil `plugin.execute()`. Ia mendelegasikannya ke `ToolDispatcher`.
*   **Desktop Delegations:** Saat LLM *stream* terdeteksi memancarkan blok *Function Call* atau `<terminal>`, *Stream Interceptor* di backend akan menahan *chunk* tersebut, mengevaluasinya via `ToolDispatcher.execute()`, dan hanya meneruskannya jika diotorisasi (`ALLOW`).

### 4.1 Diagram Alur Eksekusi Lama vs Baru
```mermaid
graph TD
    %% Arsitektur Lama
    subgraph Current Architecture (Decentralized)
        A1[LLM Stream] -->|SSE Bypass| B1[Desktop Svelte Execution]
        A2[Event Bus Tool.Requested] --> C1[tool_subscriber] --> D1[plugin.execute]
    end

    %% Arsitektur Baru
    subgraph New Architecture (Single Choke Point)
        E1[LLM Engine] --> F1[Stream Interceptor]
        F1 -->|Tool Call / Terminal| G1[ToolDispatcher]
        
        E2[Event Bus Tool.Requested] --> G1
        
        G1 -->|1. Risk Gate| H1[EngineeringLifecycleManager]
        G1 -->|2. Budget Guard| H1
        G1 -->|3. Workspace Isolation| H1
        
        H1 -->|Decision: ALLOW| I1[Execute Plugin / Forward to Desktop]
        H1 -->|Decision: DENY| J1[Block Execution & Log Audit]
    end
```

### 4.2 Urutan Evaluasi Policy (Deterministic Order)
Untuk mencegah *policy inversion* atau bypassing di kemudian hari, `ToolDispatcher` wajib mengevaluasi aturan dalam urutan ketat dan *immutable* berikut:
1. **EngineeringLifecycleManager:** Memeriksa keselarasan tool dengan status siklus (*OBSERVE/PROPOSAL/IMPLEMENTATION*).
2. **Risk Gate:** Memeriksa bahaya eksekusi (misal: penulisan di luar batas sistem, perintah CLI destruktif).
3. **Budget Guard:** Memastikan batasan token, memori, atau limit waktu belum tercapai.
4. **Workspace Isolation:** Memastikan eksekusi terkunci (*sandboxed*) dalam konteks *workspace* aktif.
5. **Capability Adapter:** Validasi kesiapan infrastruktur alat.
6. **Final Execution:** Eksekusi akhir (delegasi ke *Subagent* atau *Desktop*).

### 4.3 Standard Response Contract
Setiap lapisan evaluasi di atas wajib merespons dengan kontrak seragam (*Standard Response Contract*):
*   `ALLOW` - Eksekusi disetujui.
*   `ALLOW_WITH_LIMIT` - Disetujui namun dengan restriksi tertentu (misal: *timeout* pendek).
*   `DENY` - Eksekusi ditolak seketika (menghasilkan *Event Audit*).
*   `REQUIRE_OWNER_APPROVAL` - Diblokir sementara hingga intervensi otorisasi dari Owner.

## 5. Daftar Integration Point yang Harus Dimigrasikan
1.  **`tool_subscriber.ts`:** Mengganti pendelegasian plugin.
2.  **`stream_handler.ts` (Core Interceptor):** Menambahkan logika *buffer & parse* untuk *tool calls* dan *terminal tags* sebelum *chunk* dikirim ke klien SSE.
3.  **`capability_adapter.ts`:** Disingkirkan dari *policy logic*. Hanya bertugas melakukan koneksi I/O.
4.  **`llm_orchestrator.ts`:** Konfigurasi tag `<terminal>` harus diintegrasikan dengan status deterministik `ToolDispatcher`.

## 6. Migration Strategy (Tanpa Breaking Change)
Migrasi dilakukan bertahap menggunakan *Shadow Mode*:
1.  **Fase 1 (Dispatcher Scaffold):** Buat kelas `ToolDispatcher.ts` yang membungkus `EngineeringLifecycleManager.enforcePolicy()`. Awalnya hanya me-*log* keputusan (tidak melempar *error*/memblokir).
2.  **Fase 2 (Subagent Migration):** Rutekan `tool_subscriber.ts` ke `ToolDispatcher`. Ini aman karena berjalan di backend secara terisolasi.
3.  **Fase 3 (Stream Interceptor):** Terapkan *parser* JSON untuk mendeteksi *tool calls* di dalam `stream_handler.ts`.
4.  **Fase 4 (Hard Enforcement):** Ubah mode *Shadow* menjadi *Active*. `DENY` akan membatalkan *event* dan memutus transmisi eksekusi ke klien.

---
**Status:** APPROVED_WITH_LIMIT (Phase 1, 2, 3 Active in Shadow Mode)
**Terkait:** GAP-NEW-019 (Remains OPEN)

> **Architecture Review Note:**
> Phase 4 (Hard Enforcement) ditangguhkan. Perpindahan *Authority* eksekusi absolut dari *Desktop* ke *Backend* (menggunakan *Signed Execution Token*) adalah perubahan arsitektur fundamental yang membutuhkan observasi mendalam dari data *False Positives* di *Shadow Mode*, dan akan didesain melalui RFC terpisah ("Backend Authoritative Execution Architecture").
