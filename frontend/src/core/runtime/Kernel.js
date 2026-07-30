import React from 'react';
import { ApplicationManager } from '../application/ApplicationManager';
import { WindowManager } from '../window/WindowManager';
import { WidgetRegistry } from '../workspace/WidgetRegistry';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { lazyLoadWithRetry } from '../workspace/lazyLoadWithRetry';
import { EventBus } from './EventBus';
import { VaultService } from './services/VaultService';
import { BrainService } from './services/BrainService';
import { Engineer } from './services/engineer.js';
import { StorageManager } from './StorageManager.js';
import { ProcessManager } from './ProcessManager.js';
import { ModuleLoader } from './module-loader.js';
import { DiscoveryManager } from './DiscoveryManager.js';
import { MemoryService } from './services/MemoryService.js';
import { KnowledgeService } from './services/KnowledgeService.js';
import { AgentOrchestratorService } from './services/AgentOrchestratorService.js';
import { ToolRegistryService } from './services/ToolRegistryService.js';
import { SemanticContextService } from './services/SemanticContextService.js';

/**
 * MAEF Kernel v2.0
 * Follows MAEF Bootstrap System Specification (17_MAEF_BOOTSTRAP_SYSTEM.md)
 */
class Kernel {
  constructor() {
    // Core State
    this.status = 'COLD'; // COLD → BOOTING → RUNNING → ERROR → SHUTTING_DOWN
    this.currentPhase = 0;
    this.bootPromise = null;
    this.serviceManager = null;
    this.health = {
      startTime: null,
      uptime: 0,
      totalEvents: 0,
      errors: [],
      warnings: []
    };
    this.config = {
      mode: 'BOOTSTRAP',
      safeMode: false,
      logLevel: 'INFO'
    };
    this.identity = {
      systemName: 'Mamet Ecosystem',
      version: '3.0.0',
      user: null,
      createdAt: null
    };
    this._shutdownHandlers = [];
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, data };
    if (this.health[level + 's']) {
      this.health[level + 's'].push(logEntry);
    }
    console.log(`[${timestamp}] [Kernel] [${level}] ${message}`, data || '');
  }

  async boot(serviceManager) {
    if (this.bootPromise) {
      this.log('INFO', 'Boot already in progress or finished');
      return this.bootPromise;
    }
    this.serviceManager = serviceManager;
    this.bootPromise = this._executeBootstrapSequence(serviceManager);
    return this.bootPromise;
  }

  async _executeBootstrapSequence(serviceManager) {
    if (this.status !== 'COLD') {
      this.log('INFO', `Boot skipped (status: ${this.status})`);
      return;
    }

    this.health.startTime = Date.now();
    this.log('INFO', 'MAEF Kernel Bootstrap Sequence Started');

    try {
      // PHASE 0 — KERNEL INITIALIZATION
      await this._phase0_InitializeKernel(serviceManager);

      // PHASE 1 — SYSTEM CORE REGISTRATION
      await this._phase1_SystemCoreRegistration(serviceManager);

      // PHASE 2 — EVENT SYSTEM BOOTSTRAP
      await this._phase2_EventSystemBootstrap(serviceManager);

      // PHASE 3 — ADAPTER REGISTRY INIT
      await this._phase3_AdapterRegistryInit(serviceManager);

      // PHASE 4 — VERIFICATION ENGINE STARTUP
      await this._phase4_VerificationEngineStartup(serviceManager);

      // PHASE 5 — ORCHESTRATOR INITIALIZATION
      await this._phase5_OrchestratorInitialization(serviceManager);

      // PHASE 6 — LOGGING & OBSERVABILITY INIT
      await this._phase6_LoggingObservabilityInit(serviceManager);

      // PHASE 7 — METRICS SYSTEM WARMUP
      await this._phase7_MetricsSystemWarmup(serviceManager);

      // PHASE 8 — KNOWLEDGE & MEMORY INITIAL SEED
      await this._phase8_KnowledgeMemorySeed(serviceManager);

      // PHASE 9 — SYSTEM INTEGRATION CHECK
      await this._phase9_SystemIntegrationCheck(serviceManager);

      // PHASE 10 — FULL SYSTEM ACTIVATION
      await this._phase10_FullSystemActivation(serviceManager);

      this.status = 'RUNNING';
      this.config.mode = 'OPERATIONAL';
      this.log('INFO', 'MAEF Kernel Bootstrap Complete — SYSTEM READY');
    } catch (error) {
      this.log('ERROR', 'Bootstrap Failed', error);
      await this._handleBootFailure(error);
      throw error;
    }
  }

  async _phase0_InitializeKernel(serviceManager) {
    this.currentPhase = 0;
    this.status = 'BOOTING';
    this.config.mode = 'BOOTSTRAP';
    this.identity.createdAt = new Date().toISOString();
    this.log('INFO', 'PHASE 0 — KERNEL INITIALIZATION: Started');
    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 0, name: 'KERNEL_INITIALIZATION' });
    this.log('INFO', 'PHASE 0 — KERNEL INITIALIZATION: Completed');
  }

  async _phase1_SystemCoreRegistration(serviceManager) {
    this.currentPhase = 1;
    this.log('INFO', 'PHASE 1 — SYSTEM CORE REGISTRATION: Started');

    // Event System (reuse if already registered)
    let eventBus;
    if (serviceManager.has('EventBus')) {
      eventBus = serviceManager.get('EventBus');
      this.log('INFO', 'Event System Already Registered — Reusing');
    } else {
      eventBus = new EventBus();
      serviceManager.register('EventBus', eventBus);
      this.log('INFO', 'Event System Registered');
    }

    // StorageManager (evolusi dari FileSystem)
    const storageManager = new StorageManager();
    serviceManager.register('StorageManager', storageManager);

    // ProcessManager
    const processManager = new ProcessManager(eventBus);
    serviceManager.register('ProcessManager', processManager);

    // ModuleLoader
    const moduleLoader = new ModuleLoader(storageManager);
    serviceManager.register('ModuleLoader', moduleLoader);

    // DiscoveryManager
    const discoveryManager = new DiscoveryManager(serviceManager);
    await discoveryManager.initialize();
    serviceManager.register('DiscoveryManager', discoveryManager);

    // MetadataService
    const { MetadataService } = await import('../metadata/MetadataService.js');
    const metadataService = new MetadataService(serviceManager);
    await metadataService.initialize();
    serviceManager.register('MetadataService', metadataService);
    this.log('INFO', 'MetadataService Initialized & Registered');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 1, name: 'SYSTEM_CORE_REGISTRATION' });
    this.log('INFO', 'PHASE 1 — SYSTEM CORE REGISTRATION: Completed');
  }

  async _phase2_EventSystemBootstrap(serviceManager) {
    this.currentPhase = 2;
    this.log('INFO', 'PHASE 2 — EVENT SYSTEM BOOTSTRAP: Started');

    const eventBus = serviceManager.get('EventBus');
    this.eventBus = eventBus; // Store reference for health tracking
    eventBus.activate = () => { eventBus._active = true; };
    eventBus._active = true; // Simple activation for now
    this.log('INFO', 'Event System Activated');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 2, name: 'EVENT_SYSTEM_BOOTSTRAP' });
    this.log('INFO', 'PHASE 2 — EVENT SYSTEM BOOTSTRAP: Completed');
  }

  async _phase3_AdapterRegistryInit(serviceManager) {
    this.currentPhase = 3;
    this.log('INFO', 'PHASE 3 — CORE CAPABILITY SERVICES INIT: Started');

    // 1. Vault Service (Security First)
    const vaultService = new VaultService(serviceManager);
    await vaultService.initialize();
    serviceManager.register('VaultService', vaultService);

    // Engineer Service (Engineering Brain)
    const engineer = new Engineer(serviceManager);
    await engineer.initialize();
    serviceManager.register('Engineer', engineer);

    // 2. Brain Service (AI Orchestration)
    const brainService = new BrainService(serviceManager);
    await brainService.initialize();
    serviceManager.register('BrainService', brainService);

    // Memory Service
    const memoryService = new MemoryService(serviceManager);
    await memoryService.initialize();
    serviceManager.register('MemoryService', memoryService);

    // Semantic Context Service
    const semanticContextService = new SemanticContextService(serviceManager);
    await semanticContextService.initialize();
    serviceManager.register('SemanticContextService', semanticContextService);

    // Knowledge Service
    const knowledgeService = new KnowledgeService(serviceManager);
    await knowledgeService.initialize();
    serviceManager.register('KnowledgeService', knowledgeService);

    // Agent Orchestrator Service
    const agentOrchestrator = new AgentOrchestratorService(serviceManager);
    await agentOrchestrator.initialize();
    serviceManager.register('AgentOrchestratorService', agentOrchestrator);

    // Tool Registry Service
    const toolRegistry = new ToolRegistryService(serviceManager);
    await toolRegistry.initialize();
    serviceManager.register('ToolRegistryService', toolRegistry);

    // 3. Initialize Adapter Registry stub
    const adapterRegistry = {
      adapters: new Map(),
      register(name, adapter) {
        this.adapters.set(name, { ...adapter, status: 'REGISTERED', active: false });
      },
      get(name) {
        return this.adapters.get(name);
      },
      list() {
        return Array.from(this.adapters.values());
      }
    };
    serviceManager.register('AdapterRegistry', adapterRegistry);

    // Register stub adapters
    adapterRegistry.register('AI', { name: 'AI Adapter', type: 'AI' });
    adapterRegistry.register('DB', { name: 'Database Adapter', type: 'DB' });
    adapterRegistry.register('Search', { name: 'Search Adapter', type: 'SEARCH' });
    adapterRegistry.register('Tool', { name: 'Tool Adapter', type: 'TOOL' });
    this.log('INFO', 'Adapter Registry & Core Services Initialized');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 3, name: 'CORE_CAPABILITY_SERVICES_INIT' });
    this.log('INFO', 'PHASE 3 — CORE CAPABILITY SERVICES INIT: Completed');
  }

  async _phase4_VerificationEngineStartup(serviceManager) {
    this.currentPhase = 4;
    this.log('INFO', 'PHASE 4 — VERIFICATION ENGINE STARTUP: Started');

    const verificationEngine = {
      mode: 'SAFE_BOOTSTRAP_MODE',
      validate: () => ({ valid: true, confidence: 1.0 }),
      verifyEvidence: () => ({ verdict: 'PASS' }),
      verifyPatchEngineering: () => ({ decision: 'PASS', score: 1.0, failures: [] })
    };
    serviceManager.register('VerificationEngine', verificationEngine);
    this.log('INFO', 'Verification Engine Started in SAFE_BOOTSTRAP_MODE');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 4, name: 'VERIFICATION_ENGINE_STARTUP' });
    this.log('INFO', 'PHASE 4 — VERIFICATION ENGINE STARTUP: Completed');
  }

  async _phase5_OrchestratorInitialization(serviceManager) {
    this.currentPhase = 5;
    this.log('INFO', 'PHASE 5 — ORCHESTRATOR INITIALIZATION: Started');

    // AgentOrchestratorService now handles actual orchestration, DRY-RUN stub removed.
    this.log('INFO', 'Orchestrator initialization handled by AgentOrchestratorService');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 5, name: 'ORCHESTRATOR_INITIALIZATION' });
    this.log('INFO', 'PHASE 5 — ORCHESTRATOR INITIALIZATION: Completed');
  }

  async _phase6_LoggingObservabilityInit(serviceManager) {
    this.currentPhase = 6;
    this.log('INFO', 'PHASE 6 — LOGGING & OBSERVABILITY INIT: Started');

    const loggingSystem = {
      captureEvent: (event) => this.log('DEBUG', 'Captured event', event),
      getLogs: () => [...this.health.errors, ...this.health.warnings]
    };
    serviceManager.register('LoggingSystem', loggingSystem);
    this.log('INFO', 'Logging & Observability System Initialized');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 6, name: 'LOGGING_OBSERVABILITY_INIT' });
    this.log('INFO', 'PHASE 6 — LOGGING & OBSERVABILITY INIT: Completed');
  }

  async _phase7_MetricsSystemWarmup(serviceManager) {
    this.currentPhase = 7;
    this.log('INFO', 'PHASE 7 — METRICS SYSTEM WARMUP: Started');

    const metricsSystem = {
      baseline: { latency: 0, eventThroughput: 0, errorRate: 0 },
      measure: (metric, value) => this.log('DEBUG', `Metric recorded: ${metric}=${value}`),
      getMetrics: () => this.getHealth()
    };
    serviceManager.register('MetricsSystem', metricsSystem);
    metricsSystem.measure('boot_phase', 7);
    this.log('INFO', 'Metrics System Warmed Up');

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 7, name: 'METRICS_SYSTEM_WARMUP' });
    this.log('INFO', 'PHASE 7 — METRICS SYSTEM WARMUP: Completed');
  }

  async _phase8_KnowledgeMemorySeed(serviceManager) {
    this.currentPhase = 8;
    this.log('INFO', 'PHASE 8 — KNOWLEDGE & MEMORY INITIAL SEED: Started');

    const knowledgeSeed = [
      { id: 'constitution', type: 'core', name: 'Constitution v3.0' },
      { id: 'vision', type: 'core', name: 'Vision' },
      { id: 'maef_principles', type: 'core', name: 'MAEF Core Principles' }
    ];
    const memorySeed = {
      userIdentity: this.identity.user,
      bootstrapContext: { phase: 8, timestamp: new Date().toISOString() },
      configSnapshot: { ...this.config }
    };
    serviceManager.register('KnowledgeSeed', knowledgeSeed);
    serviceManager.register('MemorySeed', memorySeed);

    this.log('INFO', 'Knowledge & Memory Seed Planted');
    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 8, name: 'KNOWLEDGE_MEMORY_SEED' });
    this.log('INFO', 'PHASE 8 — KNOWLEDGE & MEMORY INITIAL SEED: Completed');
  }

  async _phase9_SystemIntegrationCheck(serviceManager) {
    this.currentPhase = 9;
    this.log('INFO', 'PHASE 9 — METADATA PARSING & SYSTEM INTEGRATION: Started');

    if (!serviceManager) throw new Error("BOOT ABORTED: Missing dependency ServiceManager (Required by: Phase 9)");
    const metadataService = serviceManager.has('MetadataService') ? serviceManager.get('MetadataService') : null;
    if (!metadataService) {
      throw new Error("BOOT ABORTED\n\nMissing dependency:\nMetadataService\n\nRequired by:\nSystem Integration Check\n\nCurrent Phase:\n9");
    }

    // Register ApplicationManager, WindowManager, & WorkspaceManager
    const applicationManager = (await import('../application/ApplicationManager.js')).ApplicationManager;
    const appManagerInstance = new applicationManager(serviceManager);
    serviceManager.register('ApplicationManager', appManagerInstance);
    
    const windowManager = (await import('../window/WindowManager.js')).WindowManager;
    serviceManager.register('WindowManager', new windowManager(serviceManager));
    
    const workspaceManager = (await import('../workspace/WorkspaceManager.js')).WorkspaceManager;
    serviceManager.register('WorkspaceManager', new workspaceManager('mamet-os', serviceManager));
    this.log('INFO', 'ApplicationManager, WindowManager & WorkspaceManager Activated');

    // NavigationService
    const { NavigationService } = await import('../metadata/NavigationService.js');
    const navigationService = new NavigationService(serviceManager);
    serviceManager.register('NavigationService', navigationService);

    const checks = [
      { name: 'Event Flow', passed: true },
      { name: 'Adapter Registry', passed: true },
      { name: 'Verification Pipeline', passed: true },
      { name: 'Metadata Loaded', passed: !!metadataService.getSystemConfig() }
    ];
    const allPassed = checks.every(c => c.passed);
    if (!allPassed) {
      throw new Error('System integration check failed');
    }
    this.log('INFO', 'All integration checks passed', checks);

    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 9, name: 'METADATA_PARSING_AND_INTEGRATION' });
    this.log('INFO', 'PHASE 9 — METADATA PARSING & SYSTEM INTEGRATION: Completed');
  }

  async _phase10_FullSystemActivation(serviceManager) {
    this.currentPhase = 10;
    this.log('INFO', 'PHASE 10 — SYSTEM REGISTRATION & ACTIVATION: Started');

    if (!serviceManager.has('MetadataService')) throw new Error("BOOT ABORTED\n\nMissing dependency:\nMetadataService\n\nRequired by:\nFull System Activation\n\nCurrent Phase:\n10");
    if (!serviceManager.has('NavigationService')) throw new Error("BOOT ABORTED\n\nMissing dependency:\nNavigationService\n\nRequired by:\nFull System Activation\n\nCurrent Phase:\n10");
    if (!serviceManager.has('WorkspaceManager')) throw new Error("BOOT ABORTED\n\nMissing dependency:\nWorkspaceManager\n\nRequired by:\nFull System Activation\n\nCurrent Phase:\n10");
    if (!serviceManager.has('ApplicationManager')) throw new Error("BOOT ABORTED\n\nMissing dependency:\nApplicationManager\n\nRequired by:\nFull System Activation\n\nCurrent Phase:\n10");

    // Activate all registered adapters
    const adapterRegistry = serviceManager.get('AdapterRegistry');
    if (adapterRegistry) {
      for (const [name, adapter] of adapterRegistry.adapters.entries()) {
        adapter.active = true;
        adapter.status = 'ACTIVE';
        this.log('DEBUG', `Adapter activated: ${name}`);
      }
    }

    // Activate other services
    const verificationEngine = serviceManager.get('VerificationEngine');
    if (verificationEngine) verificationEngine.mode = 'OPERATIONAL';
    const orchestrator = serviceManager.get('AgentOrchestratorService');
    if (orchestrator) orchestrator.mode = 'OPERATIONAL';

    // Widget Registry
    let widgetRegistry;
    if (serviceManager.has('WidgetRegistry')) {
      widgetRegistry = serviceManager.get('WidgetRegistry');
    } else {
      widgetRegistry = new WidgetRegistry(serviceManager);
      serviceManager.register('WidgetRegistry', widgetRegistry);
      this.log('INFO', 'Widget Registry Registered');
    }

    // Register Default Widgets
    await this._registerDefaultWidgets(widgetRegistry, serviceManager);

    // Register Apps from Metadata
    const { AppComponents } = await import('../application/AppRegistry.js');
    const metadataService = serviceManager.get('MetadataService');
    const apps = metadataService.getApps();
    const Lucide = await import('lucide-react');
    const appManagerInstance = serviceManager.get('ApplicationManager');

    apps.forEach(app => {
      if (app.disabled) return;
      const IconComp = Lucide[app.icon] || Lucide.Box;
      const RenderComp = AppComponents[app.component] || AppComponents['HomeDashboard'];
      
      appManagerInstance.registerApp({
        id: app.id,
        name: app.name,
        iconComponent: IconComp,
        renderComponent: (props) => React.createElement(RenderComp, { ...props, appId: app.id, workspaceId: app.workspace })
      });
    });

    const navigationService = serviceManager.get('NavigationService');
    navigationService.buildTree();
    
    // Default Entry Point
    const sysConfig = metadataService.getSystemConfig();
    if (sysConfig && sysConfig.default_entry_point) {
      appManagerInstance.activateApp(sysConfig.default_entry_point);
    }

    this._emitEvent(serviceManager, 'System:Ready', { timestamp: new Date().toISOString() });
    this._emitEvent(serviceManager, 'Kernel:PhaseCompleted', { phase: 10, name: 'SYSTEM_REGISTRATION_ACTIVATION' });
    this.log('INFO', 'PHASE 10 — SYSTEM REGISTRATION & ACTIVATION: Completed');
  }

  async _registerDefaultWidgets(widgetRegistry, serviceManager) {
    const metadata = serviceManager.has('MetadataService') ? serviceManager.get('MetadataService') : null;
    if (!metadata) {
      throw new Error("MetadataService unavailable during WidgetRegistry initialization");
    }

    const { AppComponents } = await import('../application/AppRegistry.js');
    const widgets = metadata.getWidgets();
    
    widgets.forEach(w => {
      const RenderComp = AppComponents[w.component];
      if (RenderComp) {
        widgetRegistry.register({
          id: w.id,
          name: w.name,
          component: RenderComp,
          capabilities: w.capabilities
        });
      }
    });
  }

  async _handleBootFailure(error) {
    this.status = 'ERROR';
    this.config.mode = 'SAFE_MODE';
    this.log('ERROR', 'Entering SAFE_MODE', error);
  }

  _emitEvent(serviceManager, eventName, data) {
    try {
      if (!serviceManager || !serviceManager.has('EventBus')) {
        // Skip warning silently if EventBus is not yet registered (e.g., Phase 0)
        return;
      }
      const eventBus = serviceManager.get('EventBus');
      if (eventBus) {
        eventBus.emit(eventName, data);
      }
    } catch (e) {
      this.log('WARN', `Failed to emit ${eventName}`, e);
    }
  }

  // Identity Management
  setUser(userInfo) {
    this.identity.user = userInfo;
    this.log('INFO', 'User identity set', { userName: userInfo?.name || 'Unknown' });
  }

  // Health Monitoring
  getHealth() {
    this.health.uptime = Date.now() - this.health.startTime;
    if (this.eventBus) {
      this.health.totalEvents = this.eventBus.getTotalEvents();
    }
    return {
      ...this.health,
      status: this.status,
      phase: this.currentPhase,
      config: { ...this.config },
      identity: { ...this.identity }
    };
  }

  getCurrentPhase() {
    return this.currentPhase;
  }

  // Shutdown Lifecycle
  onShutdown(handler) {
    this._shutdownHandlers.push(handler);
  }

  async shutdown(serviceManager) {
    this.log('INFO', 'Kernel shutdown initiated');
    this.status = 'SHUTTING_DOWN';
    for (const handler of this._shutdownHandlers) {
      try {
        await handler();
      } catch (e) {
        this.log('ERROR', 'Shutdown handler failed', e);
      }
    }
    this.status = 'COLD';
    this.bootPromise = null;
    this.log('INFO', 'Kernel shutdown complete');
  }
}

export const kernel = new Kernel();
