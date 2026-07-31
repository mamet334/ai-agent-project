# Mamet AI Architecture Reintegration Report

**Mode:** Architecture Preservation & Capability Reintegration
**Target System:** Mamet Ecosystem (MAEF v3 OS Architecture)
**Objective:** Map legacy Mamet AI capabilities into the new Kernel, ServiceManager, Workspace, and WidgetRegistry paradigms without breaking the OS state machine.

---

## 1. Brain Manager
**(Multiple LLM Provider, Model Switch, Provider abstraction)**

* **Current Status**: Partially Implemented. The backend `llm_orchestrator.ts` supports robust cascading and abstraction. The frontend currently uses a direct `localStorage` read and inline header injection within `ConversationEngine.jsx`.
* **Architecture Gap**: UI is hardcoded. There is no OS-level Service abstracting the "Brain" state. The Conversation Engine shouldn't be responsible for reading `localStorage` or formatting provider strings.
* **Kernel Integration**:
  * **Required Service**: `BrainService` (Registered in Phase 3). Acts as the single source of truth for the active provider and model. Provides a reactive state for `ConversationEngine`.
  * **Required Application**: `app:settings` (Already exists, needs to interface with `BrainService` instead of local state).
  * **Required Widget**: `widget:brain-status` (Displays active model, latency, and token usage in the Workbench).

---

## 2. API Key Vault
**(Secure storage, Provider configuration, Runtime retrieval)**

* **Current Status**: Partially Implemented. Keys are stored in plaintext `localStorage`.
* **Architecture Gap**: Security vulnerability and lack of centralized credential management. Services shouldn't fetch raw keys directly from storage.
* **Kernel Integration**:
  * **Required Service**: `VaultService` (Registered in Phase 1). Encrypts keys locally (e.g., using a user-derived PIN) and securely injects them into outbound HTTP requests via an OS-level fetch wrapper.
  * **Required Application**: `app:credential-manager` or integrated into `app:settings` under a "Security" tab.
  * **Required Widget**: None (Vault should be invisible).

---

## 3. Knowledge Manager
**(Upload documents, RAG indexing, Vector search, Knowledge lifecycle)**

* **Current Status**: Missing (Frontend). The backend has RAG capabilities, but the new OS has no interface to upload, view, or manage vector knowledge bases.
* **Architecture Gap**: Knowledge is a core MAEF capability but lacks a dedicated App and Workspace context binding.
* **Kernel Integration**:
  * **Required Service**: `KnowledgeService` (Registered in Phase 8). Handles chunking, upload streams to Supabase, and indexing status.
  * **Required Application**: `app:knowledge-base` (A full window application to upload PDFs/Docs, view chunk distributions, and manage vector collections).
  * **Required Widget**: `widget:knowledge-search` (A sidebar widget in the Engineer workspace to manually query the vector DB).

---

## 4. Memory Manager
**(Long-term memory, Session memory, Project memory)**

* **Current Status**: Missing (Frontend). Backend performs automatic memory extraction, but it's invisible to the OS user.
* **Architecture Gap**: No observability. The user cannot see, edit, or delete what the AI has remembered.
* **Kernel Integration**:
  * **Required Service**: `MemoryService` (Registered in Phase 8). Syncs memory nodes from the backend graph database into the local OS state.
  * **Required Application**: `app:memory-graph` (A node-based visualization app showing relationships between user facts and project facts).
  * **Required Widget**: `widget:active-context` (Displays the exact memory fragments currently injected into the AI's prompt).

---

## 5. AI Agent Manager
**(Assistant, Engineer, Research, Owner)**

* **Current Status**: Partially Implemented. Currently abstracted via `WorkspaceManager` (e.g., loading `ws-engineer` changes the UI layout).
* **Architecture Gap**: The "Agent Persona" is conflated with the "UI Workspace". An agent dictates the backend prompt and tools, while a workspace dictates the frontend layout. They need separation of concerns.
* **Kernel Integration**:
  * **Required Service**: `AgentOrchestratorService` (Registered in Phase 5). Manages agent definitions (System Prompts, Tool Whitelists).
  * **Required Application**: `app:agent-forge` (An application to create custom AI personas/agents).
  * **Required Workspace**: `WorkspaceManager` will bind an Agent Profile to a Workspace Layout via the manifest context.

---

## 6. Prompt Library

* **Current Status**: Missing. System prompts are hardcoded deep inside the backend `request_pipeline.ts`.
* **Architecture Gap**: Users cannot override or manage prompt templates without changing source code.
* **Kernel Integration**:
  * **Required Service**: `PromptService`. Manages local and remote prompt templates.
  * **Required Application**: `app:prompt-library` (CRUD interface for prompt engineering).
  * **Required Widget**: `widget:prompt-snippets` (Allows quick drag-and-drop or injection of prompt templates into the Conversation Engine).

---

## 7. Tool Registry

* **Current Status**: Missing (Frontend). Backend has a `CapabilityRegistry`, but the frontend OS doesn't know what tools exist.
* **Architecture Gap**: No visibility into which tools are active or available for the current Workspace.
* **Kernel Integration**:
  * **Required Service**: `ToolRegistryService` (Registered in Phase 3). Syncs available backend tools and desktop-native tools.
  * **Required Application**: `app:tool-manager` (UI to toggle global tool permissions).
  * **Required Widget**: `widget:active-tools` (Real-time telemetry showing when the AI executes a tool, similar to the verification log).

---

## 8. Plugin System

* **Current Status**: Already Integrated (UI Level). The `ApplicationManager` and `WidgetRegistry` act as a robust frontend plugin system.
* **Architecture Gap**: Lacks a mechanism to dynamically install/uninstall plugins at runtime from an external source.
* **Kernel Integration**:
  * **Required Service**: `PluginManagerService`. Handles downloading and injecting JavaScript bundles into the `ApplicationManager` and `WidgetRegistry`.
  * **Required Application**: `app:marketplace` (UI to browse and install plugins).
  * **Required Widget**: None directly, but plugins will install their own widgets.
