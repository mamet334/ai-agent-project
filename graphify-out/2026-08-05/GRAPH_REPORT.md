# Graph Report - .  (2026-08-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1950 nodes · 2794 edges · 237 communities (166 shown, 71 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ec072c5f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AIAgent.jsx
- memoryEngine.ts
- adapter_registry.ts
- Engineer
- TokenSaverAgent
- index.jsx
- StorageManager
- src/supabase.js
- dependencies
- core_engine.ts
- IntentParser
- devDependencies
- Kernel
- TokenSaverAgent
- TokenSaverAgent
- memory_manager_v1.ts
- SessionArtifact
- Kernel.js
- verification/types.ts
- ExecutionTraceService.js
- llm_orchestrator.ts
- request_pipeline.ts
- devDependencies
- dependencies
- runtime_context.ts
- WorkspaceManager
- decisionEngine.ts
- MockEngineer
- dependencies
- event_bus.ts
- plugins/registry.ts
- dependencies
- RepositoryReaderService
- MemorySystem
- policy_engine.ts
- acceptance_review.ts
- VerificationEngine
- RuntimeContext
- backend/package.json
- build
- frontend/src/App.jsx
- useService.js
- parser_pipeline.ts
- context_builder.ts
- ToolManager
- ChaosMemorySystem
- DiscoveryManager
- ProcessManager
- verification_service.ts
- PolicyEnforcer
- airdropEngine.cjs
- main.cjs
- MetadataService
- truthGraphMemory.ts
- audit.js
- scripts
- mametlite/src/App.jsx
- extract_post_process.js
- ui_automation_test.js
- parseRequestParams
- MockEngineer
- EventBus
- unifiedCognition.ts
- cleanup_bad_memories.js
- replace_index_request_fixed.js
- replace_index_request_fixed_2.js
- test_concurrency.js
- verification_engine.ts
- security_audit.cjs
- ApplicationManager
- BrainService
- ToolRegistryService
- VaultService
- WindowManager
- intentPreprocessor.ts
- benchmark.cjs
- extract_parser.js
- patch_memory_await.js
- test_retrieval.js
- semantic_memory_v4.ts
- knowledge_manager.ts
- ConversationEngine.jsx
- AgentOrchestratorService
- behaviorMemoryEngine.ts
- shortTermMemory.ts
- replace_index_clean.js
- replace_index_request.js
- verification_engine_v2_acceptance.ts
- OpenAIEmbeddingAdapter
- electron
- nsis
- contextUnifier.ts
- semanticBridge.ts
- balanced_system_patch.js
- cost_reduction_patch.js
- hard_cost_shield_patch.js
- migrate_gemini.js
- replace_index.js
- trace_memory_mock.js
- verification_decision_acceptance.ts
- generate-handoff.js
- context_pipeline.ts
- document_search.ts
- scraper.ts
- migrate_workspace.js
- frontend/package.json
- KnowledgeService
- MemoryService
- analyze_double.js
- cron_toggle_patch.js
- extract_core.js
- extract_core_v2.js
- extract_parser_2.js
- extract_parser_3.js
- hard_trace.mjs
- inject_logs.js
- observability_patch.js
- patch_all_dashboards.js
- patch_dashboards.js
- patch_index.js
- patch_memory_audit.js
- patch_response.js
- patch_trace.js
- shopee_toggle_patch.js
- simulate_runtime.js
- smart_feel_patch.js
- smart_memory_extraction.js
- verify_db2.js
- backup-export/index.ts
- @supabase/supabase-js
- vercel.json
- fetch_logs.js
- fetch_memories.js
- cognitiveMemoryGovernor.ts
- singleCognitiveCore.ts
- patch_capabilities.js
- read_pdf.js
- audit_workspace.js
- patch_maef.js
- test_failfast_runtime.mjs
- test_retrieval_verification.js
- verify_db.js
- stress_test_memory.js
- self_healing.ts
- backup-restore/index.ts
- imports
- imports
- check_agent_logs.js
- check_db.js
- fix_memory.js
- frontend/check_agent_logs.js
- check_db.mjs
- lucide-react
- autoprefixer
- memoryStabilityCore.ts
- read_only_test.mjs
- auditor_trace.mjs
- extract_request_pipeline_1.js
- extract_request_pipeline_2.js
- extract_request_pipeline_3.js
- fix_catch.js
- fix_error.js
- fix_imports.js
- insert_memory_direct.js
- mock.ts
- patch_agent.js
- patch_core_maef_control.js
- patch_stream.js
- real_trace.mjs
- scratch_refactor.js
- source_trace_extractor_acceptance.ts
- spy_active_memories.mjs
- spy_user_memories.mjs
- scratch/test_rag.mjs
- trace_memory.mjs
- test_memory_v2.mjs
- audit_supabase.mjs
- edge_audit_supabase.mjs
- file-saver
- final_audit_supabase.mjs
- final_stability_audit.mjs
- ghost-cursor
- mermaid
- puppeteer-extra
- xlsx
- fix_slashes.js
- strict_debug.mjs
- check-keys/index.ts
- cron-agent/index.ts
- debug-cron/index.ts
- health-check/index.ts
- knowledge-health/index.ts
- test-audit/index.ts

## God Nodes (most connected - your core abstractions)
1. `Engineer` - 46 edges
2. `Kernel` - 38 edges
3. `RuntimeContext` - 34 edges
4. `supabase` - 28 edges
5. `WorkspaceManager` - 20 edges
6. `StorageManager` - 18 edges
7. `CapabilityAdapter` - 18 edges
8. `ServiceManager` - 17 edges
9. `TokenSaverAgent` - 17 edges
10. `RepositoryReaderService` - 16 edges

## Surprising Connections (you probably didn't know these)
- `handler()` --calls--> `overrideMemory()`  [EXTRACTED]
  api/memory/override.ts → lib/memoryEngine.ts
- `handler()` --calls--> `emitTelemetryEvent()`  [EXTRACTED]
  api/memory/read.ts → backend/telemetry.js
- `handler()` --calls--> `resolveTraceId()`  [EXTRACTED]
  api/memory/read.ts → backend/telemetry.js
- `handler()` --calls--> `readMemory()`  [EXTRACTED]
  api/memory/read.ts → lib/memoryEngine.ts
- `handler()` --calls--> `emitTelemetryEvent()`  [EXTRACTED]
  api/memory/write.ts → backend/telemetry.js

## Import Cycles
- None detected.

## Communities (237 total, 71 thin omitted)

### Community 0 - "AIAgent.jsx"
Cohesion: 0.05
Nodes (18): ChatHeader(), ChatInput(), ChatMessages(), parseThinkingContent(), Sidebar(), FloatingWindowManager(), WorkspaceNavWidget(), AppShell() (+10 more)

### Community 1 - "memoryEngine.ts"
Cohesion: 0.08
Nodes (36): handler(), handler(), handler(), app, axios, cheerio, cors, express (+28 more)

### Community 2 - "adapter_registry.ts"
Cohesion: 0.08
Nodes (9): GeminiAdapter, GroqAdapter, OpenAIAdapter, OpenRouterAdapter, processOpenAIStream(), AdapterContext, AdapterResult, CapabilityAdapter (+1 more)

### Community 4 - "TokenSaverAgent"
Cohesion: 0.07
Nodes (14): MainOrchestrator, TokenSaverAgent, agent, inputs, inputs, testCases, lowerText, testCases (+6 more)

### Community 5 - "index.jsx"
Cohesion: 0.08
Nodes (14): processAttachedFile(), processExcel(), processGenericFile(), processImage(), processZip(), buildWorkspaceTree(), scanWorkspaceFiles(), SKIP_DIRS (+6 more)

### Community 6 - "StorageManager"
Cohesion: 0.07
Nodes (3): SessionArtifact, FileIndexService, StorageManager

### Community 7 - "src/supabase.js"
Cohesion: 0.09
Nodes (3): EngineerChat(), Settings(), supabase

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (31): deno-bin, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, electron-updater, dependencies, axios, deno-bin (+23 more)

### Community 9 - "core_engine.ts"
Cohesion: 0.11
Nodes (17): RFC-014, missingEnvs, REQUIRED_ENV_VARS, pingHeartbeat(), MAEFExecutionContext, MAEFExecutionResult, MAEFPhase, MAEFStateSnapshot (+9 more)

### Community 10 - "IntentParser"
Cohesion: 0.10
Nodes (3): EntityExtractor, IntentParser, SemanticContextService

### Community 11 - "devDependencies"
Cohesion: 0.07
Nodes (29): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @vitejs/plugin-react, @vitejs/plugin-react, globals, devDependencies (+21 more)

### Community 14 - "TokenSaverAgent"
Cohesion: 0.09
Nodes (11): Analisis task dan tentukan strategi penghematan, Sub-agent untuk mengoptimalkan penggunaan token API, Kompresi prompt tanpa menghilangkan esensi, Cek apakah masih dalam budget, Estimasi kompleksitas task (0-1), Hitung token optimal berdasarkan kompleksitas, Ganti kata panjang dengan singkatan, Kompresi contoh panjang (+3 more)

### Community 15 - "memory_manager_v1.ts"
Cohesion: 0.13
Nodes (17): bindCognitiveExecution(), CognitiveExecutionContract, INTENT_MODES, parseCognitiveIntent(), SoftExceptionPolicy, loadProjectMemory(), ProjectMemoryResult, compressCognitiveContext() (+9 more)

### Community 16 - "SessionArtifact"
Cohesion: 0.09
Nodes (5): MockEngineer, MockEventBus, runTests(), SessionArtifact, tests

### Community 17 - "Kernel.js"
Cohesion: 0.11
Nodes (4): NavigationService, ModuleLoader, lazyLoadWithRetry(), WidgetRegistry

### Community 18 - "verification/types.ts"
Cohesion: 0.17
Nodes (20): buildConfidenceSummary(), buildSourceTrace(), buildSourceTraceText(), calculateConfidence(), mapEntryTypeToTraceType(), ADR-0006, ConfidenceInput, ConfidenceReport (+12 more)

### Community 19 - "ExecutionTraceService.js"
Cohesion: 0.15
Nodes (15): ActivityGraph(), HomeDashboard(), formatDate(), NodeInspector(), ObservabilityPanel(), useDashboardData(), buildPipeline(), enrichEventWithStep() (+7 more)

### Community 20 - "llm_orchestrator.ts"
Cohesion: 0.16
Nodes (9): CapabilityRegistry, callLLMWithCascade(), callLLMWithMetadata(), PROVIDER_COOLDOWN_DURATIONS, runCoordinatorLLM(), runLLM(), runStreamLLM(), generateEmbedding() (+1 more)

### Community 21 - "request_pipeline.ts"
Cohesion: 0.20
Nodes (14): handleAuth(), handleCorsAndOptions(), buildUnifiedExecutionContext(), enforcePolicy(), checkQuota(), executeRequestPipeline(), generateEmbeddingThroughAdapter(), getAllKeys() (+6 more)

### Community 22 - "devDependencies"
Cohesion: 0.10
Nodes (20): concurrently, cross-env, electron-builder, devDependencies, concurrently, cross-env, electron-builder, javascript-obfuscator (+12 more)

### Community 23 - "dependencies"
Cohesion: 0.11
Nodes (19): react-dom, react-markdown, remark-gfm, react-dom, react-markdown, remark-gfm, dependencies, mammoth (+11 more)

### Community 24 - "runtime_context.ts"
Cohesion: 0.11
Nodes (16): ADR-0004, ADR-0005, ADR-0009, EngineerContextResult, loadEngineerContext(), ADR-0006, BackgroundTaskTracker, EngineeringPhase (+8 more)

### Community 26 - "decisionEngine.ts"
Cohesion: 0.16
Nodes (13): buildDecisionContext(), buildExceptionPolicy(), buildExecutionContract(), CognitiveExecutionContract, DecisionEngineInput, FinalDecisionContext, IntentSpec, MemoryResult (+5 more)

### Community 27 - "MockEngineer"
Cohesion: 0.14
Nodes (4): MockEngineer, MockEventBus, runTests(), tests

### Community 28 - "dependencies"
Cohesion: 0.12
Nodes (16): cheerio, duck-duck-scrape, pdfjs-dist, pdfjs-dist, node-fetch, dependencies, cheerio, duck-duck-scrape (+8 more)

### Community 29 - "event_bus.ts"
Cohesion: 0.17
Nodes (9): ADR-0011, EventBus, EventHandler, EventType, MAEFEvent, initializeToolSubscriber(), ADR-0012, ADR-0013 (+1 more)

### Community 31 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, axios, cors, dotenv, express, googlethis, mammoth, pdf2json (+8 more)

### Community 33 - "MemorySystem"
Cohesion: 0.28
Nodes (3): MemoryNode, MemorySystem, runAllTests()

### Community 34 - "policy_engine.ts"
Cohesion: 0.26
Nodes (10): registerMemorySubscribers(), POLICY_RULES, PolicyEngine, PolicyRule, MametMode, PolicyAction, PolicyContext, PolicyDecision (+2 more)

### Community 35 - "acceptance_review.ts"
Cohesion: 0.13
Nodes (14): fail1Context, fail2Context, fail3Context, fail4Context, fail5Context, fail6Context, passContext, report1 (+6 more)

### Community 36 - "VerificationEngine"
Cohesion: 0.21
Nodes (6): baseContext, runTest(), PostProcessInput, PostProcessOutput, postProcessResponse(), VerificationEngine

### Community 37 - "RuntimeContext"
Cohesion: 0.27
Nodes (6): DispatcherDecision, DispatcherResult, ToolDispatcher, EngineeringLifecycleManager, EngineeringState, RuntimeContext

### Community 38 - "backend/package.json"
Cohesion: 0.14
Nodes (13): description, devDependencies, nodemon, engines, node, main, name, scripts (+5 more)

### Community 39 - "build"
Cohesion: 0.14
Nodes (14): build, appId, directories, portable, productName, publish, win, output (+6 more)

### Community 40 - "frontend/src/App.jsx"
Cohesion: 0.19
Nodes (4): App(), Login(), EngineerApprovalDialog(), ErrorBoundary

### Community 41 - "useService.js"
Cohesion: 0.29
Nodes (6): ActivityBar(), ApplicationContainer(), MobileBottomNav(), OSDesktopShell(), Sidebar(), useService()

### Community 42 - "parser_pipeline.ts"
Cohesion: 0.29
Nodes (9): executeResponsePipeline(), parseCoordinatorPlan(), extractSourceTrace(), ADR-0012, ContractValidationResult, CoordinatorPlanParseResult, SubAgentPlan, TraceParseResult (+1 more)

### Community 43 - "context_builder.ts"
Cohesion: 0.25
Nodes (10): executeRoutingDecision(), RoutingDecision, buildBlockedResponse(), buildGateVerdictText(), validateEvidence(), EvidenceInput, buildUniversalContract(), executeVerificationPipeline() (+2 more)

### Community 45 - "ChaosMemorySystem"
Cohesion: 0.27
Nodes (3): ChaosMemorySystem, MemoryNode, runChaos()

### Community 48 - "verification_service.ts"
Cohesion: 0.42
Nodes (8): registerAuditSubscribers(), registerLifecycleSubscribers(), initializeEventSubscribers(), logVerificationAudit(), logVerificationReport(), persistEvidenceAuditLog(), persistTelemetryLog(), persistVerificationAuditLog()

### Community 49 - "PolicyEnforcer"
Cohesion: 0.24
Nodes (5): MemoryType, PolicyDecision, PolicyEnforcer, RagScope, WorkspaceType

### Community 50 - "airdropEngine.cjs"
Cohesion: 0.22
Nodes (10): { app }, autoMetamaskSign(), autoSocialSign(), { createCursor }, path, puppeteer, TODO: Logika klik tombol connect wallet Metamask (Popup Handler), RecaptchaPlugin (+2 more)

### Community 51 - "main.cjs"
Cohesion: 0.18
Nodes (7): { app, BrowserWindow, ipcMain, dialog, protocol }, { exec, execSync }, fs, os, path, PROJECT_ROOT, { runAirdropTask }

### Community 53 - "truthGraphMemory.ts"
Cohesion: 0.18
Nodes (4): GraphEdge, GraphNode, memoryGraph, TruthGraph

### Community 54 - "audit.js"
Cohesion: 0.18
Nodes (7): bundleSize, fs, ignoreDirs, path, result, stats, tree

### Community 55 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, desktop, dev, dist, dist:portable, dist:publish, electron:dev (+2 more)

### Community 56 - "mametlite/src/App.jsx"
Cohesion: 0.40
Nodes (5): App(), parseMarkdown(), callAgentSimple(), parseSSEStream(), supabase

### Community 57 - "extract_post_process.js"
Cohesion: 0.20
Nodes (9): chatBiasaEndIdx, chatBiasaStartIdx, content, declareStreamResIdx, fs, memAEndIdx, memAStartIdx, memBEndIdx (+1 more)

### Community 58 - "ui_automation_test.js"
Cohesion: 0.20
Nodes (8): FRONTEND_DIR, fs, http, logFile, path, puppeteer, SCREENSHOT_DIR, { spawn }

### Community 59 - "parseRequestParams"
Cohesion: 0.29
Nodes (4): parseRequestParams(), GuardianState, WorkspaceGuardian, WorkspaceTarget

### Community 62 - "unifiedCognition.ts"
Cohesion: 0.33
Nodes (8): computeContextPriority(), executeCognition(), ExecutionPlan, generateExecutionPlan(), resolveConflicts(), selectActiveTruth(), UCLInput, UCLOutput

### Community 63 - "cleanup_bad_memories.js"
Cohesion: 0.22
Nodes (7): afterResult, delResult, { execSync }, fs, listResult, path, tempSqlFile

### Community 64 - "replace_index_request_fixed.js"
Cohesion: 0.22
Nodes (8): content, endIndex, { execSync }, finalContent, fs, lines, replacement, startIndex

### Community 65 - "replace_index_request_fixed_2.js"
Cohesion: 0.22
Nodes (8): content, endIndex, { execSync }, finalContent, fs, lines, replacement, startIndex

### Community 66 - "test_concurrency.js"
Cohesion: 0.31
Nodes (8): cleanDb(), { execSync }, fs, getRowCount(), path, runConcurrencyTest(), sendRequest(), tempSqlFile

### Community 67 - "verification_engine.ts"
Cohesion: 0.22
Nodes (8): CheckSeverity, ADR-0013, VerificationAuditRecord, VerificationCheck, VerificationContext, VerificationDecision, VerificationReport, VerificationStatus

### Community 68 - "security_audit.cjs"
Cohesion: 0.43
Nodes (7): fs, path, test(), testIPCBridgeSecurity(), testPromptInjection(), testXSStoRCE(), warn()

### Community 74 - "intentPreprocessor.ts"
Cohesion: 0.32
Nodes (7): detectStyle(), getSpecForIntent(), INTENT_MODES, INTENT_RULES, preprocessIntent(), PreprocessorOutput, STYLE_KEYWORDS

### Community 75 - "benchmark.cjs"
Cohesion: 0.25
Nodes (7): chunks, endBuffer, endRegex, { performance }, startBuffer, startRegex, words

### Community 76 - "extract_parser.js"
Cohesion: 0.25
Nodes (7): content, { execSync }, fs, healerEnd, healerStart, traceEnd, traceStart

### Community 77 - "patch_memory_await.js"
Cohesion: 0.25
Nodes (7): code, filePath, fs, patch1, patch2, patch3, path

### Community 78 - "test_retrieval.js"
Cohesion: 0.29
Nodes (7): { execSync }, fs, getEmbedding(), path, queries, runRetrievalTest(), tempSqlFile

### Community 79 - "semantic_memory_v4.ts"
Cohesion: 0.39
Nodes (3): runSemanticTests(), SemanticMemoryEngine, SemanticNode

### Community 80 - "knowledge_manager.ts"
Cohesion: 0.36
Nodes (4): evaluateKnowledgeQuality(), chunkText(), knowledgeManagerPlugin, corsHeaders

### Community 81 - "ConversationEngine.jsx"
Cohesion: 0.43
Nodes (4): FolderSelector(), ChatHistory(), ConversationEngine(), parseThinkingContent()

### Community 83 - "behaviorMemoryEngine.ts"
Cohesion: 0.38
Nodes (5): BehaviorMemory, behaviorStore, createDefaultBehavior(), getBehaviorProfile(), updateBehaviorProfile()

### Community 84 - "shortTermMemory.ts"
Cohesion: 0.29
Nodes (3): memoryStore, SessionBuffer, ShortTermMessage

### Community 85 - "replace_index_clean.js"
Cohesion: 0.29
Nodes (6): afterB2, beforeB1, betweenB1B2, content, fs, lines

### Community 86 - "replace_index_request.js"
Cohesion: 0.29
Nodes (6): content, endIndex, { execSync }, fs, replacement, startIndex

### Community 87 - "verification_engine_v2_acceptance.ts"
Cohesion: 0.29
Nodes (5): baseContext, ctxFail1, ctxFail2, ctxFail3, report

### Community 89 - "electron"
Cohesion: 0.33
Nodes (5): electron, { contextBridge, ipcRenderer }, files, electron, dist/**/*

### Community 90 - "nsis"
Cohesion: 0.33
Nodes (6): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, oneClick, shortcutName

### Community 91 - "contextUnifier.ts"
Cohesion: 0.33
Nodes (4): FinalContext, IntentSpec, MemoryResult, UnifierInput

### Community 92 - "semanticBridge.ts"
Cohesion: 0.40
Nodes (5): bridgeSemanticIntent(), detectStyle(), INTENT_RULES, SemanticBridgeOutput, STYLE_KEYWORDS

### Community 93 - "balanced_system_patch.js"
Cohesion: 0.33
Nodes (5): fs, indexCode, indexPath, memoryPath, path

### Community 94 - "cost_reduction_patch.js"
Cohesion: 0.33
Nodes (5): fs, indexCode, indexPath, memoryPath, path

### Community 95 - "hard_cost_shield_patch.js"
Cohesion: 0.33
Nodes (5): fs, indexCode, indexPath, memoryPath, path

### Community 96 - "migrate_gemini.js"
Cohesion: 0.33
Nodes (5): code, filePath, fs, newCode, path

### Community 97 - "replace_index.js"
Cohesion: 0.33
Nodes (5): after, before, content, fs, lines

### Community 98 - "trace_memory_mock.js"
Cohesion: 0.33
Nodes (5): data, keywords, promptLower, scoredMemories, topMemories

### Community 99 - "verification_decision_acceptance.ts"
Cohesion: 0.33
Nodes (5): baseContext, ctxFail1, ctxFail2, ctxFailMulti, runTest()

### Community 100 - "generate-handoff.js"
Cohesion: 0.33
Nodes (4): { execSync }, fs, HANDOFF_FILE, path

### Community 101 - "context_pipeline.ts"
Cohesion: 0.47
Nodes (5): buildContextPipeline(), buildFinalPrompt(), buildStructuredContext(), ContextPipelineParams, ContextPipelineResult

### Community 102 - "document_search.ts"
Cohesion: 0.53
Nodes (4): searchDocuments(), FormattedRagContext, RagDocument, RoutingDecision

### Community 103 - "scraper.ts"
Cohesion: 0.47
Nodes (4): detectLoginIntent(), extractUrls(), loginAndScrape(), scrapeDirectFetch()

### Community 104 - "migrate_workspace.js"
Cohesion: 0.40
Nodes (3): __dirname, __filename, supabase

### Community 105 - "frontend/package.json"
Cohesion: 0.40
Nodes (4): main, name, type, version

### Community 108 - "analyze_double.js"
Cohesion: 0.40
Nodes (4): code, filePath, fs, path

### Community 109 - "cron_toggle_patch.js"
Cohesion: 0.40
Nodes (4): code, cronPath, fs, path

### Community 110 - "extract_core.js"
Cohesion: 0.40
Nodes (4): content, coreLogic, fs, startIdx

### Community 111 - "extract_core_v2.js"
Cohesion: 0.40
Nodes (4): content, coreLogic, fs, startIdx

### Community 112 - "extract_parser_2.js"
Cohesion: 0.40
Nodes (4): content, fs, healerEnd, healerStart

### Community 113 - "extract_parser_3.js"
Cohesion: 0.40
Nodes (4): content, fs, healerEnd, healerStart

### Community 114 - "hard_trace.mjs"
Cohesion: 0.50
Nodes (4): checkLogs(), __dirname, fetchSupabase(), __filename

### Community 115 - "inject_logs.js"
Cohesion: 0.40
Nodes (4): code, fs, indexPath, path

### Community 116 - "observability_patch.js"
Cohesion: 0.40
Nodes (4): fs, indexCode, indexPath, path

### Community 117 - "patch_all_dashboards.js"
Cohesion: 0.40
Nodes (4): agentPath, code, fs, path

### Community 118 - "patch_dashboards.js"
Cohesion: 0.40
Nodes (4): agentPath, code, fs, path

### Community 119 - "patch_index.js"
Cohesion: 0.40
Nodes (4): code, filePath, fs, path

### Community 120 - "patch_memory_audit.js"
Cohesion: 0.40
Nodes (4): code, fs, memoryPath, path

### Community 121 - "patch_response.js"
Cohesion: 0.40
Nodes (4): code, filePath, fs, path

### Community 122 - "patch_trace.js"
Cohesion: 0.40
Nodes (4): code, fs, memoryFile, path

### Community 123 - "shopee_toggle_patch.js"
Cohesion: 0.40
Nodes (4): code, dashPath, fs, path

### Community 124 - "simulate_runtime.js"
Cohesion: 0.60
Nodes (4): consoleLog(), logs, processAndSaveMemory(), simulateRequest()

### Community 125 - "smart_feel_patch.js"
Cohesion: 0.40
Nodes (4): code, cronPath, fs, path

### Community 126 - "smart_memory_extraction.js"
Cohesion: 0.40
Nodes (4): fs, memoryCode, memoryPath, path

### Community 127 - "verify_db2.js"
Cohesion: 0.50
Nodes (3): checkLegacy(), run(), supabase

### Community 128 - "backup-export/index.ts"
Cohesion: 0.40
Nodes (4): BACKUP_TABLES, corsHeaders, CRITICAL_TABLES, NOTE: document_chunks TIDAK di-backup karena:

### Community 129 - "@supabase/supabase-js"
Cohesion: 0.50
Nodes (4): @supabase/supabase-js, @supabase/supabase-js, @supabase/supabase-js, @supabase/supabase-js

### Community 130 - "vercel.json"
Cohesion: 0.50
Nodes (3): builds, routes, version

### Community 135 - "patch_capabilities.js"
Cohesion: 0.50
Nodes (3): content, fs, kmContent

### Community 136 - "read_pdf.js"
Cohesion: 0.50
Nodes (3): dataBuffer, fs, pdf

### Community 138 - "patch_maef.js"
Cohesion: 0.50
Nodes (3): content, fs, indexContent

### Community 139 - "test_failfast_runtime.mjs"
Cohesion: 0.83
Nodes (3): delay(), main(), runTest()

### Community 140 - "test_retrieval_verification.js"
Cohesion: 0.67
Nodes (3): queries, run(), sendQuery()

### Community 141 - "verify_db.js"
Cohesion: 0.67
Nodes (3): checkLegacy(), run(), supabase

### Community 144 - "self_healing.ts"
Cohesion: 0.83
Nodes (3): cosineSimilarity(), evaluateCausalTruth(), runSelfHealingLoopAsync()

### Community 145 - "backup-restore/index.ts"
Cohesion: 0.50
Nodes (3): corsHeaders, NOTE: document_chunks tidak di-restore karena tidak di-backup., RESTORE_ORDER

### Community 146 - "imports"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 147 - "imports"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 153 - "lucide-react"
Cohesion: 0.67
Nodes (3): lucide-react, lucide-react, lucide-react

### Community 154 - "autoprefixer"
Cohesion: 0.67
Nodes (3): autoprefixer, autoprefixer, autoprefixer

## Knowledge Gaps
- **537 isolated node(s):** `anonClient`, `name`, `version`, `description`, `main` (+532 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **71 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `@supabase/supabase-js`, `mermaid`, `frontend/package.json`, `file-saver`, `dependencies`, `ghost-cursor`, `lucide-react`, `puppeteer-extra`, `xlsx`, `dependencies`, `dependencies`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `processExcel()` connect `index.jsx` to `xlsx`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `xlsx` connect `xlsx` to `dependencies`, `index.jsx`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **What connects `anonClient`, `name`, `version` to the rest of the system?**
  _537 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AIAgent.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05254237288135593 - nodes in this community are weakly interconnected._
- **Should `memoryEngine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08325624421831637 - nodes in this community are weakly interconnected._
- **Should `adapter_registry.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08405797101449275 - nodes in this community are weakly interconnected._