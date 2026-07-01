import { ApplicationManager } from '../application/ApplicationManager';
import { WindowManager } from '../window/WindowManager';
import { WidgetRegistry } from '../workspace/WidgetRegistry';
import { lazyLoadWithRetry } from '../workspace/lazyLoadWithRetry';
import { MessageSquare, Terminal, Database, FlaskConical } from 'lucide-react';

class Kernel {
  constructor() {
    this.status = 'cold';
    this.services = {};
  }

  async boot(serviceManager) {
    if (this.status !== 'cold') return;

    this.status = 'booting';
    console.log('[Kernel] Boot sequence initiated');

    // Phase 1: Register Widget Registry
    const widgetRegistry = new WidgetRegistry(serviceManager);
    serviceManager.register('WidgetRegistry', widgetRegistry);
    console.log('[Kernel] Widget Registry registered');

    // Register Default Widgets
    widgetRegistry.register({
      id: 'widget:workspace-nav',
      name: 'Workspace Navigation',
      icon: 'Compass',
      version: '1.0.0',
      allowed_workspaces: ['*'],
      default_size: { width: 250, height: 400 },
      default_workbench: 'left',
      component: lazyLoadWithRetry(() => import('../../components/widgets/WorkspaceNavWidget.jsx'), 'widget:workspace-nav')
    });

    widgetRegistry.register({
      id: 'widget:engineering-tasks',
      name: 'Engineering Tasks',
      icon: 'Target',
      version: '1.0.0',
      allowed_workspaces: ['ENGINEER', '*'],
      default_size: { width: 300, height: 400 },
      default_workbench: 'left',
      component: lazyLoadWithRetry(() => import('../../components/widgets/EngineeringTasksWidget.jsx'), 'widget:engineering-tasks')
    });

    widgetRegistry.register({
      id: 'widget:architecture-gaps',
      name: 'Architecture Gaps',
      icon: 'Activity',
      version: '1.0.0',
      allowed_workspaces: ['ENGINEER', '*'],
      default_size: { width: 300, height: 400 },
      default_workbench: 'left',
      component: lazyLoadWithRetry(() => import('../../components/widgets/ArchitectureGapsWidget.jsx'), 'widget:architecture-gaps')
    });

    widgetRegistry.register({
      id: 'widget:verification-log',
      name: 'Verification Log',
      icon: 'ShieldCheck',
      version: '1.0.0',
      allowed_workspaces: ['ENGINEER', '*'],
      default_size: { width: 300, height: 400 },
      default_workbench: 'right',
      component: lazyLoadWithRetry(() => import('../../components/widgets/VerificationLogWidget.jsx'), 'widget:verification-log')
    });

    console.log('[Kernel] Default widgets registered');

    // Phase 2: Register Application Manager
    const applicationManager = new ApplicationManager(serviceManager);
    serviceManager.register('ApplicationManager', applicationManager);
    console.log('[Kernel] Application Manager registered');

    // Phase 3: Register Window Manager
    const windowManager = new WindowManager(serviceManager);
    serviceManager.register('WindowManager', windowManager);
    console.log('[Kernel] Window Manager registered');

    this.status = 'running';
    console.log('[Kernel] Boot sequence completed');
  }

  getStatus() {
    return this.status;
  }
}

export const kernel = new Kernel();
