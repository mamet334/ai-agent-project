# Daftar Dead Code — Mamet OS
## Kandidat untuk dipindahkan ke `_knowledge_archive/`

**Tanggal Analisis:** $(Get-Date -Format "yyyy-MM-dd")
**Total Kandidat:** 596 file
**Tidak Termasuk:** `frontend/src/core/`, `frontend/src/components/`, `frontend/electron/`, `backend/`

---

## ⚠️ PENTING: JANGAN DIARSIPKAN

File-file berikut TERLIHAT sebagai dead code oleh scanner, tetapi MASIH DIGUNAKAN oleh sistem:

| File | Alasan |
|------|--------|
| `constitution/*.md` | Dibaca oleh `engineer.js` via `storageManager.read()` |
| `frontend/package.json` | Esensial untuk build |
| `frontend/vite.config.js` | Esensial untuk build |
| `frontend/tailwind.config.js` | Esensial untuk build |
| `frontend/postcss.config.js` | Esensial untuk build |
| `frontend/public/metadata/*.json` | Dibaca oleh `MetadataService` saat runtime |
| `supabase/functions/*/index.ts` | Deployable units ke Supabase (mungkin aktif) |

---

## PRIORITAS 1 — PALING AMAN DIARSIPKAN

### 1. `scratch/` — 174 file (Eksperimen & Testing)

```
scratch/20260711_add_confidence_score.sql
scratch/20260711_tool_dispatcher_index.sql
scratch/GAP-NEW-007_engineering_metrics_dashboard.sql
scratch/GAP-NEW-007_schema_migration.sql
scratch/README.md
scratch/SHADOW-METRICS-REPORT.md
scratch/WAVE5-BLOCKER.md
scratch/acceptance_review.ts
scratch/analyze_double.js
scratch/audit.js
scratch/audit.py
scratch/audit_result.json
scratch/audit_workspace.js
scratch/auditor_trace.mjs
scratch/balanced_system_patch.js
scratch/benchmark.cjs
scratch/causal_trace.ts
scratch/check.js
scratch/check.sql
scratch/check_documents_table.mjs
scratch/check_mem.js
scratch/check_openrouter.js
scratch/check_openrouter_balance.js
scratch/check_rls.sql
scratch/cleanup_bad_memories.js
scratch/commit_msg.txt
scratch/core_engine_orig.ts
scratch/cost_reduction_patch.js
scratch/count_loc.ps1
scratch/cron_toggle_patch.js
scratch/engineering_metrics.sql
scratch/extract_core.js
scratch/extract_core_v2.js
scratch/extract_parser.js
scratch/extract_parser_2.js
scratch/extract_parser_3.js
scratch/extract_post_process.js
scratch/extract_request_pipeline_1.js
scratch/extract_request_pipeline_2.js
scratch/extract_request_pipeline_3.js
scratch/fetch_audit.js
scratch/fetch_gql.js
scratch/fetch_openapi.js
scratch/fetch_options.js
scratch/fetch_schema.js
scratch/find_anthropic.js
scratch/fix_catch.js
scratch/fix_error.js
scratch/fix_imports.js
scratch/fix_slashes.js
scratch/hard_cost_shield_patch.js
scratch/hard_trace.mjs
scratch/inject_logs.js
scratch/insert_memory_direct.js
scratch/migrate_gemini.js
scratch/mock.ts
scratch/observability_patch.js
scratch/patch_agent.js
scratch/patch_all_dashboards.js
scratch/patch_core_maef_control.js
scratch/patch_dashboards.js
scratch/patch_index.js
scratch/patch_maef.js
scratch/patch_memory_audit.js
scratch/patch_memory_await.js
scratch/patch_response.js
scratch/patch_stream.js
scratch/patch_trace.js
scratch/query2.sql
scratch/query3.sql
scratch/query4.sql
scratch/query5.sql
scratch/real_trace.mjs
scratch/replace_index.js
scratch/replace_index_clean.js
scratch/replace_index_request.js
scratch/replace_index_request_fixed.js
scratch/replace_index_request_fixed_2.js
scratch/screenshots/01_initial_home.png
scratch/screenshots/02_engineer_workspace.png
scratch/screenshots/03_back_to_home.png
scratch/shadow_metrics_dashboard.sql
scratch/shopee_toggle_patch.js
scratch/simulate_runtime.js
scratch/smart_feel_patch.js
scratch/smart_memory_extraction.js
scratch/source_trace_extractor_acceptance.ts
scratch/spy_active_memories.mjs
scratch/spy_user_memories.mjs
scratch/test.js
scratch/test_concurrency.js
scratch/test_detector.ts
scratch/test_failfast_runtime.mjs
scratch/test_gemini_embed.mjs
scratch/test_keys_locally.js
scratch/test_or_large.js
scratch/test_or_stream.js
scratch/test_phase_a.ts
scratch/test_pipeline.ts
scratch/test_rag.mjs
scratch/test_rag_upload.js
scratch/test_raw_stream.js
scratch/test_retrieval.js
scratch/test_retrieval_verification.js
scratch/test_score.ts
scratch/test_single.js
scratch/test_token.js
scratch/test_token_saver.js
scratch/trace_memory.mjs
scratch/trace_memory_mock.js
scratch/trace_output.txt
scratch/tsc_out.txt
scratch/tsc_out10.txt
scratch/tsc_out11.txt
scratch/tsc_out12.txt
scratch/tsc_out13.txt
scratch/tsc_out14.txt
scratch/tsc_out15.txt
scratch/tsc_out16.txt
scratch/tsc_out2.txt
scratch/tsc_out3.txt
scratch/tsc_out4.txt
scratch/tsc_out5.txt
scratch/tsc_out6.txt
scratch/tsc_out7.txt
scratch/tsc_out8.txt
scratch/tsc_out9.txt
scratch/tsc_out_gap10.txt
scratch/tsc_out_gap4_new.txt
scratch/tsc_out_gap6.txt
scratch/tsc_out_gap7.txt
scratch/tsc_out_gap7_final.txt
scratch/tsc_out_gap8.txt
scratch/tsc_out_gap9.txt
scratch/tsc_out_gap9_final.txt
scratch/tsc_out_gap9_full.txt
scratch/tsc_out_memory_workspace.txt
scratch/tsc_out_wave_52g1.txt
scratch/tsc_out_wave_52g1_fixed.txt
scratch/tsc_out_wave_52g2.txt
scratch/tsc_out_wave_52g2_final.txt
scratch/tsc_out_wave_54.txt
scratch/tsc_out_wave_54_embedding.txt
scratch/tsc_out_wave_54_embedding2.txt
scratch/tsc_out_wave_54_final.txt
scratch/tsc_out_wave_54_gap4.txt
scratch/tsc_out_wave_54_gap4_fix.txt
scratch/tsc_out_wave_54_gap5.txt
scratch/tsc_out_wave_54_gap5_final.txt
scratch/tsc_out_wave_54_researcher.txt
scratch/tsc_out_wave_54_stream.txt
scratch/tsc_out_wave_55.txt
scratch/tsc_out_wave_55_final.txt
scratch/ui_audit_log.txt
scratch/ui_automation_test.js
scratch/update_pm.sql
scratch/update_pm_12.sql
scratch/update_pm_14.sql
scratch/update_pm_15.sql
scratch/update_pm_16.sql
scratch/update_rls_auth.sql
scratch/verification_audit_acceptance.ts
scratch/verification_decision_acceptance.ts
scratch/verification_engine_v2_acceptance.ts
scratch/verify_counts.sql
scratch/verify_db.js
scratch/verify_db2.js
scratch/verify_deploy.mjs
scratch/verify_rls.sql
scratch/verify_tables.sql
scratch/view_logs.js
scratch/wave1_commit_msg.txt
scratch/wave2_commit_msg.txt
scratch/wave3_commit_msg.txt
```

### 2. Root Level Scripts — 26 file

```
audit_supabase.mjs
check_agent_logs.js
check_db.js
convert_pdf.mjs
edge_audit_supabase.mjs
fetch_logs.js
fetch_memories.js
final_audit_supabase.mjs
final_stability_audit.mjs
fix_memory.js
forensic_debug.mjs
patch_capabilities.js
post_schema_audit.mjs
read_only_test.mjs
read_pdf.js
read_pdf2.mjs
scratch_refactor.js
stress_test_memory.js
strict_debug.mjs
test_groq.js
test_health.js
test_memory_v2.mjs
test_phase1_2_engineer.mjs
test_phase3_reasoning_lock.mjs
test_phase4_session_artifact.mjs
test_rag.mjs
```

### 3. Root Level SQL — 31 file

```
fix_cron_table.sql
fix_scheduled_tasks_rls.sql
fix_schema_and_rls.sql
mamet_memory_schema.sql
patch_backup_restore_schema.sql
query.sql
setup_agent_logs.sql
setup_ai_system_logs.sql
setup_billing.sql
setup_chats.sql
setup_cron.sql
setup_cron_health.sql
setup_evidence_audit_log.sql
setup_knowledge_governance.sql
setup_knowledge_workspace.sql
setup_memory_audit_log.sql
setup_memory_audit_logs.sql
setup_memory_causal_graph.sql
setup_memory_cognitive_graph.sql
setup_memory_grounding.sql
setup_memory_idempotency.sql
setup_memory_level5.sql
setup_memory_loop_closure.sql
setup_memory_v1.sql
setup_monitoring.sql
setup_rag.sql
setup_rls_documents.sql
setup_rls_secure_production.sql
setup_shopee_ninja.sql
setup_subgraph_extractor.sql
setup_verification_audit_logs.sql
```

### 4. `changelog/` — 40 file

```
changelog/2026-07-14-home-dashboard-active-thought-highlight.md
changelog/2026-07-14-home-dashboard-animated-flow.md
changelog/2026-07-14-home-dashboard-brain-cluster-v3.md
changelog/2026-07-14-home-dashboard-disable-autozoom.md
changelog/2026-07-14-home-dashboard-ecosystem-health.md
changelog/2026-07-14-home-dashboard-knowledge-graph.md
changelog/2026-07-14-home-dashboard-node-health-counters.md
changelog/2026-07-14-home-dashboard-observatory-upgrade.md
changelog/2026-07-14-home-dashboard-overall-system-status.md
changelog/2026-07-14-home-dashboard-solar-system-v4.md
changelog/2026-07-14-v4.0.0-architecture-migration.md
changelog/2026-07-14-v4.0.0-ui-constitution-amendment.md
changelog/2026-07-15-aiagent-modularization.md
changelog/2026-07-15-architecture-realignment-execution.md
changelog/2026-07-15-hard-policy-enforcement.md
changelog/2026-07-15-workspace-architecture-audit.md
changelog/2026-07-15-workspace-policy-finalization.md
changelog/2026-07-16-execution-trace-upgrade-phase0-0-started.md
changelog/2026-07-16-fix-ai-connectivity-settings.md
changelog/2026-07-16-v4.1.2-responsive-ui.md
changelog/2026-07-16-v4.1.3-widget-and-brain-fixes.md
changelog/2026-07-16-v4.1.4-mobile-responsive-ui-fixes.md
changelog/2026-07-17-activity-cluster-v2-solar-system-production-release.md
changelog/2026-07-17-observability-instrumentation-critical-path-testing-note.md
changelog/2026-07-22-debugging-mamet-os
changelog/2026-07-23-activity-graph-visibility-fix.md
changelog/2026-07-23-verification-engine-audit-fix.md
changelog/2026-07-23/AUDIT-01-runtime-evidence.md
changelog/2026-07-23/AUDIT-02-runtime-gap.md
changelog/2026-07-23/AUDIT-03-single-instrumentation-point.md
changelog/2026-07-23/AUDIT-04-payload-lifecycle.md
changelog/2026-07-23/AUDIT-05-verification-architecture.md
changelog/2026-07-23/SUMMARY.md
changelog/2026-07-24-memory-system-repair-and-policy-fix.md
changelog/2026-07-28-engineer-file-index-complete.md
changelog/2026-07-28_Engineer_Pipeline.md
changelog/2026-07-28_engineer_debugging_fixes.md
changelog/2026-07-30-engineer-repository-reader-kernel-fix.md
changelog/2026-07-30-engineer-support-updates.md
changelog/2026-07-30-security-fix-openrouter-deficit.md
```

### 5. `lib/` — 11 file (Memory engine versi lama)

```
lib/behaviorMemoryEngine.ts
lib/cognitiveMemoryGovernor.ts
lib/contextUnifier.ts
lib/globalCognitionLoop.ts
lib/intentPreprocessor.ts
lib/memoryStabilityCore.ts
lib/semanticBridge.ts
lib/shortTermMemory.ts
lib/singleCognitiveCore.ts
lib/truthGraphMemory.ts
lib/unifiedCognition.ts
```

### 6. `mametlite/` — 14 file (Proyek terpisah)

```
mametlite/.gitignore
mametlite/README.md
mametlite/eslint.config.js
mametlite/mantra mametlite.txt
mametlite/package.json
mametlite/public/favicon.svg
mametlite/public/icons.svg
mametlite/src/App.css
mametlite/src/assets/hero.png
mametlite/src/assets/react.svg
mametlite/src/assets/vite.svg
mametlite/src/lib/__tests__/mainOrchestrator.test.js
mametlite/src/lib/__tests__/tokenSaverAgent.test.js
mametlite/vite.config.js
```

### 7. Root Level TypeScript — 6 file

```
chaos_memory_v3.ts
memory_hardening_v2.ts
semantic_memory_v4.ts
test-yt.ts
test_memory_suite.ts
test_memory_v2.ts
```

### 8. Root Level Python — 3 file

```
python.py
python1.py
scratch_refactor.py
```

### 9. Root Level Docs & Konfigurasi — 45 file

```
AGENTS.md
ANTIGRAVITY_AUDITOR_SOP.md
ANTI_HALU_PROTOCOL.md
ANTI_LIMIT_GUIDE.md
ARCHITECTURE_REINTEGRATION_REPORT.md
Acceptance Test Suite Phase 2-5.md
Acceptance Test Suite Phase 2-5.txt
CHANGELOG.md
DEPENDENCY_MAP.md
DESIGN_PHILOSOPHY.md
INIT.md
MENTAL_MODEL.md
NORTH_STAR.md
OWNER_MANIFESTO.md
PRODUCTION_READINESS_WEB3.md
PR_MAMETLITE.MD
README.md
RELEASE_ACTIVITY_CLUSTER_V1.md
Runtime Pipeline Audit.txt
TODO.md
audit sistem mamet.txt
audit-report.json
cara menggunkan copilot .txt
cara push gihub dan buat ulang exe.txt
deno.lock
full_tree.md
handoff context untuk chatgpt.txt
mamet universal roadmap.txt
mantra realita ringkas.md
mantra.txt
memori jangka panjang.txt
memori jangka pendek.txt
memory_manager_audit.md
menjalankan aplikasi.md
product_audit_report.md
rencana better stack.txt
roadmap lanjutan phase 2.txt
scratch_diff.txt
shopee_affiliate_project.txt
stress_test_output.txt
struktur mamet ai.md
swagger.json
tujuan universal.md
untukchatgpt.txt
yang di jalankan copilot.txt
```

### 10. Root Level Gambar — 1 file

```
ChatGPT Image 23 Jun 2026, 19.05.44.png
```

### 11. `api/memory/` — 3 file

```
api/memory/override.ts
api/memory/read.ts
api/memory/write.ts
```

### 12. `graphify-out/` — 19 file

```
graphify-out/.graphify_analysis.json
graphify-out/.graphify_labels.json
graphify-out/.graphify_labels.json.sig
graphify-out/.graphify_root
graphify-out/2026-07-29/.graphify_analysis.json
graphify-out/2026-07-29/.graphify_labels.json
graphify-out/2026-07-29/GRAPH_REPORT.md
graphify-out/2026-07-29/graph.json
graphify-out/2026-07-30/.graphify_analysis.json
graphify-out/2026-07-30/.graphify_labels.json
graphify-out/2026-07-30/GRAPH_REPORT.md
graphify-out/2026-07-30/graph.json
graphify-out/2026-07-31/.graphify_analysis.json
graphify-out/2026-07-31/.graphify_labels.json
graphify-out/2026-07-31/GRAPH_REPORT.md
graphify-out/2026-07-31/graph.json
graphify-out/GRAPH_REPORT.md
graphify-out/graph.html
graphify-out/graph.json
```

### 13. `scripts/` — 1 file

```
scripts/generate-handoff.js
```

### 14. `handoff/` — 1 file

```
handoff/HANDOFF_NEXT_SESSION.md
```

### 15. `frontend/` (non-core, non-component) — 24 file

```
frontend/.env
frontend/.env.example
frontend/.githubworkflows/build.yml
frontend/.gitignore
frontend/.vercelignore
frontend/check_agent_logs.js
frontend/check_db.mjs
frontend/frontend_tree.md
frontend/migrate_workspace.js
frontend/package.json
frontend/postcss.config.js
frontend/public/icon.png
frontend/public/metadata/capabilities.json
frontend/public/metadata/dashboard.json
frontend/public/metadata/navigation.json
frontend/public/metadata/system.json
frontend/public/metadata/widgets.json
frontend/public/metadata/workspace.json
frontend/security_audit.cjs
frontend/src/config/metadata/widgets-engineer.yaml
frontend/src/config/metadata/workspace-engineer.yaml
frontend/tailwind.config.js
frontend/vite.config.js
frontend/vite.config.js.timestamp-1780590186875-b4762ee3b86758.mjs
```

---

## PRIORITAS 2 — PERLU VERIFIKASI SEBELUM DIARSIPKAN

### `docs/` — 145 file

Semua dokumentasi, ADR, arsitektur, project-memory, task, roadmap, monetisasi, dll.

**⚠️ Catatan:** Beberapa file di `docs/` mungkin masih dirujuk oleh Engineer atau dibaca manual. Verifikasi sebelum diarsipkan.

### `supabase/functions/` — 25 file

```
supabase/config.toml
supabase/functions/agent-process/index.ts
supabase/functions/agent-process/lib/coordinator/citation_parser.ts
supabase/functions/agent-process/lib/coordinator/grounding_parser.ts
supabase/functions/agent-process/lib/coordinator/post_processing.ts
supabase/functions/agent-process/lib/maef/engineering_lifecycle.ts
supabase/functions/agent-process/lib/verification/verification_pipeline.ts
supabase/functions/agent-process/plugins/memory_manager.ts
supabase/functions/agent-process/plugins/self_healing.ts
supabase/functions/backup-export/index.ts
supabase/functions/backup-restore/index.ts
supabase/functions/check-keys/index.ts
supabase/functions/cron-agent/index.ts
supabase/functions/debug-cron/index.ts
supabase/functions/health-check/index.ts
supabase/functions/knowledge-health/index.ts
supabase/functions/ping/index.ts
supabase/functions/rag-process/.npmrc
supabase/functions/rag-process/deno.json
supabase/functions/rag-process/index.ts
supabase/functions/test-audit/index.ts
supabase/functions/test-suite/.npmrc
supabase/functions/test-suite/deno.json
supabase/functions/test-suite/index.ts
supabase/schema_reference.md
```

**⚠️ Catatan:** Edge Functions di-deploy langsung ke Supabase. Cek apakah masih aktif di production sebelum diarsipkan.

---

## RINGKASAN

| Kategori | Jumlah File | Prioritas Arsip |
|----------|-------------|-----------------|
| `scratch/` | 174 | ✅ **P1 — Aman** |
| Root Level Scripts | 26 | ✅ **P1 — Aman** |
| Root Level SQL | 31 | ✅ **P1 — Aman** |
| `changelog/` | 40 | ✅ **P1 — Aman** |
| `lib/` | 11 | ✅ **P1 — Aman** |
| `mametlite/` | 14 | ✅ **P1 — Aman** |
| Root Level TypeScript | 6 | ✅ **P1 — Aman** |
| Root Level Python | 3 | ✅ **P1 — Aman** |
| Root Level Docs & Config | 45 | ✅ **P1 — Aman** |
| Root Level Gambar | 1 | ✅ **P1 — Aman** |
| `api/memory/` | 3 | ✅ **P1 — Aman** |
| `graphify-out/` | 19 | ✅ **P1 — Aman** |
| `scripts/` | 1 | ✅ **P1 — Aman** |
| `handoff/` | 1 | ✅ **P1 — Aman** |
| `frontend/` (non-core) | 24 | ✅ **P1 — Aman** |
| `docs/` | 145 | ⚠️ **P2 — Verifikasi** |
| `supabase/functions/` | 25 | ⚠️ **P2 — Verifikasi** |
| **TOTAL** | **596** | |

---

*Dibuat oleh BLACKBOXAI — Analisis Import Dependency Graph*
