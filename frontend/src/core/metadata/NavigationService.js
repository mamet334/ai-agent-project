export class NavigationService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.tree = [];
  }

  buildTree() {
    const metadataService = this.serviceManager.get('MetadataService');
    const applicationManager = this.serviceManager.get('ApplicationManager');
    
    if (!metadataService || !applicationManager) {
      console.error('[NavigationService] Required services not found');
      return;
    }

    const navData = metadataService.getNavigation();
    const registeredApps = applicationManager.getState().apps;
    const capabilities = metadataService.getCapabilities();
    const appToCap = metadataService.getAppToCapabilityMapping();

    const isAppEnabled = (appId) => {
      const capId = appToCap[appId];
      if (!capId) return true; // If no capability required, it's enabled by default
      const cap = capabilities.find(c => c.id === capId);
      return cap ? cap.enabled : false;
    };

    // Enhance navigation config with actual app data
    this.tree = navData.map(node => {
      if (node.type === 'item') {
        const app = registeredApps.find(a => a.id === node.appId);
        return { ...node, app, isAvailable: !!app && isAppEnabled(node.appId) };
      } else if (node.type === 'group') {
        return {
          ...node,
          items: node.items.map(subItem => {
            const app = registeredApps.find(a => a.id === subItem.appId);
            return { ...subItem, app, isAvailable: !!app && isAppEnabled(subItem.appId) };
          })
        };
      }
      return node;
    });

    console.log('[NavigationService] Navigation tree built');
  }

  getTree() {
    return this.tree;
  }
}
