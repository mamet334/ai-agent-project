import { serviceManager } from './ServiceManager';
import { EventBus } from './EventBus';
import { ApplicationManager } from '../application/ApplicationManager';
import { WindowManager } from '../window/WindowManager';
import { WidgetRegistry } from '../workspace/WidgetRegistry';
import { lazyLoadWithRetry } from '../workspace/lazyLoadWithRetry';

class Kernel {
  constructor() {
    this.status = 'COLD';
  }

  async boot() {
    if (this.bootPromise) {
      console.log(`[KERNEL] Boot already in progress or finished, returning existing promise.`);
      return this.bootPromise;
    }
    
    this.bootPromise = (async () => {
      if (this.status !== 'COLD') {
        console.log(`[KERNEL] Boot skipped (status: ${this.status})`);
        return;
      }
      
      console.log('[KERNEL] Booting Mamet OS...');
      this.status = 'BOOTING';

    // 1. Core Runtime Services (Phase 4)
    const eventBus = new EventBus();
    serviceManager.register('EventBus', eventBus);

    // 2. Registries and Managers
    const widgetRegistry = new WidgetRegistry(serviceManager);
    serviceManager.register('WidgetRegistry', widgetRegistry);

    // Register Default Widgets
    widgetRegistry.register({
      id: 'widget:engineering-tasks',
      name: 'Engineering Tasks',
      icon: 'Target',
      version: '1.0.0',
      allowed_workspaces: ['ENGINEER', '*'],
      default_size: { width: 300, height: 400 },
      default_workbench: 'left',
      component: lazyLoadWithRetry(() => import('../../components/widgets/EngineeringTasksWidget'), 'widget:engineering-tasks')
    });

    widgetRegistry.register({
      id: 'widget:architecture-gaps',
      name: 'Architecture Gaps',
      icon: 'Activity',
      version: '1.0.0',
      allowed_workspaces: ['ENGINEER', '*'],
      default_size: { width: 300, height: 400 },
      default_workbench: 'left',
      component: lazyLoadWithRetry(() => import('../../components/widgets/ArchitectureGapsWidget'), 'widget:architecture-gaps')
    });

    widgetRegistry.register({
      id: 'widget:verification-log',
      name: 'Verification Log',
      icon: 'ShieldCheck',
      version: '1.0.0',
      allowed_workspaces: ['ENGINEER', '*'],
      default_size: { width: 300, height: 400 },
      default_workbench: 'right',
      component: lazyLoadWithRetry(() => import('../../components/widgets/VerificationLogWidget'), 'widget:verification-log')
    });

    widgetRegistry.register({
      id: 'widget:workspace-nav',
      name: 'Workspace Navigation',
      icon: 'Compass',
      version: '1.0.0',
      allowed_workspaces: ['*'],
      default_size: { width: 250, height: 400 },
      default_workbench: 'left',
      component: lazyLoadWithRetry(() => import('../../components/widgets/WorkspaceNavWidget'), 'widget:workspace-nav')
    });

    const applicationManager = new ApplicationManager(serviceManager);
    serviceManager.register('ApplicationManager', applicationManager);

    const windowManager = new WindowManager(serviceManager);
    serviceManager.register('WindowManager', windowManager);

      this.status = 'RUNNING';
      console.log('[KERNEL] System Ready.');
    })();
    
    return this.bootPromise;
  }
}

export const kernel = new Kernel();
