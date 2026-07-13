# RFC-014: Self Engineering Lifecycle (SEL)

## 1. Latar Belakang & Architecture Gap
Mamet Engineer saat ini masih bekerja layaknya AI Assistant tradisional yang reaktif. Berdasarkan *Constitution* (`07_ENGINEERING_SYSTEM.md`), proses rekayasa harus mematuhi tahapan yang ketat: Observe → Analyze → Propose → Approve → Implement → Verify. RFC ini bertujuan untuk menegakkan siklus tersebut secara deterministik pada *Runtime*. (Menutup GAP-NEW-009).

## 2. Engineering State Machine (Minimalis & Runtime First)
State Machine hanya berjalan di level `RuntimeContext` tanpa persistensi database untuk saat ini.

### 2.1 Explicit Command Routing (Deterministic Intent)
Status siklus diubah HANYA menggunakan perintah tekstual eksplisit dari Owner. Hal ini menghindari eksploitasi *false positives* dari natural language (seperti "Saya setuju, tapi jangan jalankan").
*   `ENGINEER:OBSERVE` → Masuk ke fase **OBSERVE_ANALYZE** (Default). `ownerApprovalGranted = false`.
*   `ENGINEER:PROPOSAL` → Masuk ke fase **PROPOSAL**. `ownerApprovalGranted = false`.
*   `ENGINEER:APPROVE` atau `APPROVED RFC-*` → Masuk ke fase **IMPLEMENTATION**. `ownerApprovalGranted = true`.
*   `ENGINEER:VERIFY` → Masuk ke fase **VERIFICATION_DOCUMENTATION**. `ownerApprovalGranted = true`.

## 3. Capability Groups & Tool Interceptor Matrix
Prinsip **Least Required Capability** diberlakukan. Setiap alat yang ada di sistem dikelompokkan:
*   `READ_FILES` (view_file, list_dir, grep_search)
*   `RUN_SAFE_COMMANDS` (run_command terbatas untuk audit/test)
*   `WRITE_DOCS` (write_to_file/replace_file_content HANYA untuk `docs/` atau `scratch/`)
*   `WRITE_SOURCE` (write_to_file/replace_file_content untuk `src/`, `backend/`, dll)
*   `RUN_BUILD` (run_command untuk kompilasi/deploy)

### Matrix Izin (Execution Guard)
| Phase | `ownerApproval` | Capability Group yang Aktif |
| :--- | :--- | :--- |
| **OBSERVE_ANALYZE** | `false` | `READ_FILES`, `RUN_SAFE_COMMANDS` |
| **PROPOSAL** | `false` | `READ_FILES`, `RUN_SAFE_COMMANDS`, `WRITE_DOCS` |
| **IMPLEMENTATION** | `true` | `READ_FILES`, `WRITE_SOURCE`, `WRITE_DOCS`, `RUN_SAFE_COMMANDS` |
| **VERIFICATION_DOCS**| `true` | `READ_FILES`, `RUN_SAFE_COMMANDS`, `RUN_BUILD`, `WRITE_DOCS` |

## 4. Integration Points pada Orchestrator (`core_engine.ts`)
1.  **State Initialization (Phase 2):** Setelah perintah eksplisit dideteksi, status `EngineeringState` disimpan dalam `RuntimeContext`.
2.  **Layer 1 (Pre-flight Filter):** Fungsi `EngineeringLifecycleManager.filterTools` akan membuang alat-alat di luar *Capability Group* dari array `ctx.request.tools`.
3.  **Layer 2 (Execution Guard):** Sesaat sebelum *sub-agent* atau pendelegasian alat berjalan (via *Event Bus*), fungsi `enforcePolicy()` memvalidasi eksekusi. Jika AI mencoba mengelabui filter dan mengakses file kode tanpa izin, eksekusi akan diblokir dengan log audit `DENY`.

---
**Status:** READY FOR IMPLEMENTATION
**Tanggal:** 2026-07-11
