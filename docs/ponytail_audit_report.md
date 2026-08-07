# 🔍 Ponytail Audit — Mamet OS Ecosystem

> Audit over-engineering saja, bukan kebenaran logika.
> Diurutkan dari potongan terbesar ke terkecil.

---

## Temuan Besar — Potongan Terbesar

| # | Tag | Apa yang bisa dipotong | Pengganti | Path | ~Baris |
|---|-----|------------------------|-----------|------|--------|
| 1 | **delete** | `frontend_tree.md` — dump tree 3.2 MB yang di-commit | Jalankan `tree` saat butuh, jangan commit | [frontend_tree.md](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/frontend_tree.md) | 46,765 |
| 2 | **delete** | `_knowledge_archive/` — seluruh arsip legacy (TSC logs, changelog lama, script satu kali, lib deprecated, mametlite boilerplate) | Hapus seluruh folder; sudah diarsipkan via `_DEAD_CODE_ARCHIVE_LIST.md` | [_knowledge_archive/](file:///d:/SLAMET/other/mamet%20os%20ecosystem/_knowledge_archive) | ~13,650 |
| 3 | **delete** | `graphify-out/` — snapshot analisis statis bertanggal + cache AST JSON | Simpan hanya report terbaru, hapus history & cache | [graphify-out/](file:///d:/SLAMET/other/mamet%20os%20ecosystem/graphify-out) | ~21,000 |
| 4 | **shrink** | `engineer.js` (1,943 baris) — God-object service frontend, semua logic engineer di satu file | Pecah jadi modul per concern (approval, task, verification) | [engineer.js](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/runtime/services/engineer.js) | — |
| 5 | **shrink** | `server.js` (1,528 baris) — seluruh backend Express di satu file monolitik | Pecah per-route: `routes/chat.js`, `routes/agent.js`, dsb | [server.js](file:///d:/SLAMET/other/mamet%20os%20ecosystem/backend/server.js) | — |

---

## lib/ — Modul TypeScript Tidak Terpakai

Semua 18 file di `lib/` (1,555 baris) membentuk rantai import internal, tapi **tidak satupun** di-import oleh backend `server.js` atau frontend. Hanya `api/memory/` (3 file) yang menggunakan `memoryEngine.ts`. Sisanya yang **sama sekali tidak terpakai** dari luar `lib/`:

| # | Tag | File | ~Baris |
|---|-----|------|--------|
| 6 | **delete** | `behaviorMemoryEngine.ts` — tidak di-import di mana pun | [behaviorMemoryEngine.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/behaviorMemoryEngine.ts) | 95 |
| 7 | **delete** | `cognitiveMemoryGovernor.ts` — tidak di-import di mana pun | [cognitiveMemoryGovernor.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/cognitiveMemoryGovernor.ts) | 86 |
| 8 | **delete** | `contextUnifier.ts` — tidak di-import di mana pun | [contextUnifier.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/contextUnifier.ts) | 77 |
| 9 | **delete** | `globalCognitionLoop.ts` — hanya import dari `decisionEngine` internal | [globalCognitionLoop.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/globalCognitionLoop.ts) | 111 |
| 10 | **delete** | `intentPreprocessor.ts` — tidak di-import di mana pun | [intentPreprocessor.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/intentPreprocessor.ts) | 182 |
| 11 | **delete** | `memoryStabilityCore.ts` — tidak di-import di mana pun | [memoryStabilityCore.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/memoryStabilityCore.ts) | 84 |
| 12 | **delete** | `semanticBridge.ts` — tidak di-import di mana pun | [semanticBridge.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/semanticBridge.ts) | 128 |
| 13 | **delete** | `shortTermMemory.ts` — tidak di-import di mana pun | [shortTermMemory.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/shortTermMemory.ts) | 61 |
| 14 | **delete** | `singleCognitiveCore.ts` — tidak di-import di mana pun | [singleCognitiveCore.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/singleCognitiveCore.ts) | 90 |
| 15 | **delete** | `truthGraphMemory.ts` — tidak di-import di mana pun | [truthGraphMemory.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/truthGraphMemory.ts) | 83 |
| 16 | **delete** | `unifiedCognition.ts` — tidak di-import di mana pun | [unifiedCognition.ts](file:///d:/SLAMET/other/mamet%20os%20ecosystem/lib/unifiedCognition.ts) | 98 |

> [!NOTE]
> Yang **tetap diperlukan** di `lib/`: `memoryEngine.ts`, `truthScorer.ts`, `truthScoringEngine.ts`, `supabaseClient.ts`, `memoryGovernor.ts`, `ocb.ts`, `decisionEngine.ts` — karena digunakan oleh `api/memory/` dan rantai internal.

---

## Root-Level — File Sampah & Duplikat

| # | Tag | File | ~Baris |
|---|-----|------|--------|
| 17 | **delete** | `_DEAD_CODE_ARCHIVE_LIST.md` — dump daftar dead code statis | [_DEAD_CODE_ARCHIVE_LIST.md](file:///d:/SLAMET/other/mamet%20os%20ecosystem/_DEAD_CODE_ARCHIVE_LIST.md) | 572 |
| 18 | **delete** | `_check_archived_deps.js` — script checker satu kali | [_check_archived_deps.js](file:///d:/SLAMET/other/mamet%20os%20ecosystem/_check_archived_deps.js) | 168 |
| 19 | **delete** | `Runtime Pipeline Audit.txt` — laporan audit ephemeral | [Runtime Pipeline Audit.txt](file:///d:/SLAMET/other/mamet%20os%20ecosystem/Runtime%20Pipeline%20Audit.txt) | 75 |
| 20 | **delete** | `TODO.md` — checklist usang | [TODO.md](file:///d:/SLAMET/other/mamet%20os%20ecosystem/TODO.md) | 22 |
| 21 | **delete** | `Acceptance Test Suite Phase 2-5.md` + `.txt` — duplikat | [Acceptance Test Suite Phase 2-5.md](file:///d:/SLAMET/other/mamet%20os%20ecosystem/Acceptance%20Test%20Suite%20Phase%202-5.md) | 25 |
| 22 | **delete** | `.tmp_search_agent.ps1` — script temp | [.tmp_search_agent.ps1](file:///d:/SLAMET/other/mamet%20os%20ecosystem/.tmp_search_agent.ps1) | 16 |
| 23 | **delete** | `mamet_fs` — file kosong 0 byte | [mamet_fs](file:///d:/SLAMET/other/mamet%20os%20ecosystem/mamet_fs) | 0 |
| 24 | **native** | `node-fetch` di root `package.json` — Node 18+ punya `fetch()` bawaan | Hapus dep, gunakan global `fetch()` | [package.json](file:///d:/SLAMET/other/mamet%20os%20ecosystem/package.json) | 1 |

---

## Backend

| # | Tag | File | Detail |
|---|-----|------|--------|
| 25 | **yagni** | `tools-config.js` (479 baris) — konfigurasi tools + ToolManager class dengan rate limiting, validasi domain, sandbox validation — **tidak pernah di-import/require oleh `server.js`** | Hapus seluruhnya. Jika butuh konfigurasi tools, inline di `server.js` | [tools-config.js](file:///d:/SLAMET/other/mamet%20os%20ecosystem/backend/tools-config.js) |
| 26 | **shrink** | `server.js` — `runSandbox()` didefinisikan 2x identik (baris ~896 dan ~1242) | Ekstrak jadi 1 fungsi helper |
| 27 | **shrink** | `server.js` — telemetry calls yang repetitif (~50% volume file) memiliki pola identik | Buat `wrapWithTelemetry()` helper, kurangi boilerplate |

---

## Frontend

| # | Tag | File | Detail |
|---|-----|------|--------|
| 28 | **delete** | `vite.config.js.timestamp-*.mjs` — file cache Vite stale, referensi path lama `ai-agent-project` | Hapus | [vite.config.js.timestamp...](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/vite.config.js.timestamp-1780590186875-b4762ee3b86758.mjs) |
| 29 | **delete** | `frontend/dist/` — build output yang di-commit | Tambahkan ke `.gitignore`, hapus dari repo | [dist/](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/dist) |
| 30 | **delete** | `frontend/.githubworkflows/` — folder typo (bukan `.github/workflows/`) | Pindahkan ke `.github/workflows/` atau hapus | [.githubworkflows/](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/.githubworkflows) |

---

## Docs & Constitution — Duplikat

| # | Tag | File | ~Baris |
|---|-----|------|--------|
| 31 | **delete** | `docs/architecture/ARCHITECTURE-AUDIT-POST-5-2G-1.md` — superseded | 245 |
| 32 | **delete** | `docs/project-memory/MAEF V2.md` — obsolete, digantikan V3 | 210 |
| 33 | **delete** | `docs/project-memory/MAMET AI VISION DOCUMENT.md` — legacy | 180 |
| 34 | **delete** | `docs/project-memory/change-log/2026-7-04.md` — duplikat typo | 120 |
| 35 | **delete** | `docs/roadmap/raodmap memory governor.md` — typo filename, obsolete | 85 |
| 36 | **delete** | `constitution/ENGINEERING_CONTRACT.md` — duplikat README | 285 |
| 37 | **yagni** | `constitution/20_ENGINEERING POLICY.md` — konsolidasikan ke `07_ENGINEERING_SYSTEM.md` | 248 |
| 38 | **yagni** | `constitution/21 Engineer Capability.md` — konsolidasikan ke `03_CAPABILITY_PORT.md` | 190 |

---

## Mametlite

| # | Tag | File | Detail |
|---|-----|------|--------|
| 39 | **delete** | `mametlite/mantra mametlite.txt` — manifesto/lore dokumen, bukan kode | Pindahkan ke docs/ jika mau dipertahankan | 42 baris |

---

## CI/CD

| # | Tag | File | ~Baris |
|---|-----|------|--------|
| 40 | **delete** | `.github/workflows/production-pipeline.yml` — mock CI pipeline spekulatif | 65 |

---

## Ringkasan

| Kategori | Baris bisa dihapus |
|----------|-------------------|
| `frontend_tree.md` (dump) | ~46,765 |
| `graphify-out/` (snapshot + cache) | ~21,000 |
| `_knowledge_archive/` (arsip legacy) | ~13,650 |
| `lib/` (11 modul dead code) | ~1,095 |
| Root files (temp, audit, duplikat) | ~879 |
| `tools-config.js` (dead code) | 479 |
| Docs/constitution duplikat | ~1,363 |
| Frontend (stale cache, dist, typo dir) | ~500+ |
| CI mock | 65 |

### **Total baris yang bisa dihapus: ~85,796+ baris**
### **Dependencies yang bisa dihapus: 1** (`node-fetch` dari root)

> [!IMPORTANT]
> Potongan terbesar (**~46K baris**) berasal dari satu file `frontend_tree.md` yang seharusnya tidak pernah masuk Git. Menghapus ini saja sudah mengurangi repo lebih dari separuh temuan.

> [!TIP]
> Setelah cleanup, pertimbangkan memecah dua God-file: `engineer.js` (1,943 baris) dan `server.js` (1,528 baris) — ini bukan dead code, tapi shrink opportunity yang signifikan untuk maintainability.
