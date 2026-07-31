# MAEF v3 Ecosystem Dependency Map

**Mode:** Architecture Preservation
**Objective:** Memaetakan hierarki dependensi antara Kernel, Service Manager, UI Layer (React), dan Sistem Backend berdasarkan rancangan Reintegrasi Arsitektur.

## Diagram Dependensi (Mermaid)

```mermaid
graph TD
    %% Core OS Infrastructure
    subgraph KERNEL LAYER [Layer 1: MAEF Kernel & Core]
        K[Kernel.js] --> SM[ServiceManager]
        K --> EB[EventBus]
    end

    %% Reintegrated Services
    subgraph SERVICE LAYER [Layer 2: Capability Services]
        SM --> VS[VaultService]
        SM --> BS[BrainService]
        SM --> KS[KnowledgeService]
        SM --> MS[MemoryService]
        SM --> AOS[AgentOrchestratorService]
        SM --> TS[ToolRegistryService]
        SM --> PS[PromptService]
    end

    %% OS Managers
    subgraph MANAGER LAYER [Layer 3: OS Managers]
        SM --> AM[ApplicationManager]
        SM --> WM[WorkspaceManager]
        SM --> WR[WidgetRegistry]
    end

    %% UI Applications (Presentation)
    subgraph PRESENTATION LAYER [Layer 4: React UI / Apps & Widgets]
        %% Applications
        AM --> AppSet[app:settings]
        AM --> AppKB[app:knowledge-base]
        AM --> AppMem[app:memory-graph]
        AM --> AppForge[app:agent-forge]
        AM --> AppTools[app:tool-manager]
        
        %% Widgets
        WR --> W_Brain[widget:brain-status]
        WR --> W_Ctx[widget:active-context]
        
        %% Conversation Engine
        WM --> CE[ConversationEngine.jsx]
    end

    %% Supabase Backend
    subgraph BACKEND LAYER [Layer 5: Supabase Edge & DB]
        AP[agent-process]
        LO[llm_orchestrator]
        RAG[RAG Pipeline]
        DB[(PostgreSQL / pgvector)]
    end

    %% --- CROSS LAYER DEPENDENCIES ---
    
    %% Brain & Vault Flow
    AppSet -.->|Update Config| BS
    AppSet -.->|Store Keys| VS
    CE -.->|Read State| BS
    CE -.->|Read Keys| VS
    
    %% Conversation to Backend
    CE ==>|Payload + x-byok Headers| AP
    AP ==>|Executes| LO
    
    %% Knowledge & Memory Flow
    AppKB -.->|Upload/Manage| KS
    KS ==>|Trigger Indexing| RAG
    RAG -.->|Read/Write| DB
    
    AppMem -.->|Visualize| MS
    MS ==>|Fetch Graph| DB
    
    %% Agent & Tool Flow
    AppForge -.->|Configure| AOS
    AppTools -.->|Toggle| TS
    AOS -.->|Bind to Workspace| WM
```

## Penjelasan Alur Dependensi (Dependency Flow)

### 1. The Source of Truth (Layer 1)
- **Kernel.js** adalah otoritas tertinggi. React tidak boleh menginisialisasi layanan apa pun secara independen.
- Kernel me-register `ServiceManager` dan `EventBus` pada fase awal (Phase 1 & 2).

### 2. Abstraksi Layanan (Layer 2)
Layanan-layanan ini (seperti `BrainService`, `VaultService`) hidup di dalam memori OS (bukan di dalam React State). 
- Mereka memegang state murni (Data & Logika).
- Mereka berkomunikasi satu sama lain melalui `EventBus`.
- **Aturan Dependensi:** Service tidak boleh bergantung pada UI. UI yang bergantung pada Service.

### 3. Jembatan OS ke UI (Layer 3)
- `ApplicationManager`, `WorkspaceManager`, dan `WidgetRegistry` mengambil state dari Layanan dan mendikte apa yang boleh dirender oleh React.

### 4. Presentation Layer (Layer 4)
- Aplikasi seperti `app:settings` tidak menyimpan kuncinya sendiri. Saat Anda menekan "Save", React mengirim pesan ke `VaultService`.
- `ConversationEngine` tidak lagi menebak-nebak API Key, ia meminta `VaultService` dan `BrainService` untuk merakit *Header* HTTP sebelum mengirimnya ke Backend.

### 5. Pelaksanaan Fisik (Layer 5)
- Begitu *request* sampai ke `agent-process` (Edge Function), backend sudah menerima paket bersih (Model yang digunakan + Kunci API yang dienkripsi via header + Prompt).
- `llm_orchestrator` tinggal mengeksekusi sesuai arahan tanpa peduli bagaimana UI bekerja.

---
**Status Arsitektur:** Map ini menjadi fondasi yang mutlak sebelum kita menulis kode implementasi apa pun untuk kapabilitas yang hilang.
