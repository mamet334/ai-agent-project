// DiscoveryManager.js - Runtime Contract
// Platform dan capability detection untuk Mamet OS universal
export class DiscoveryManager {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.platform = 'unknown';
    this.device = 'unknown';
    this.capabilities = [];
    this.network = { online: false, type: 'unknown' };
    this.screen = { width: 0, height: 0, pixelRatio: 1, orientation: 'unknown' };
    this.storage = { quota: 0, usage: 0, percentage: 0 };
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('[DiscoveryManager] Initializing...');
    
    // Detect platform and device
    this.platform = this.detectPlatform();
    this.device = this.detectDevice();
    this.capabilities = this.detectCapabilities();
    this.network = this.getNetworkStatus();
    this.screen = this.getScreenInfo();
    
    // Async background task (Do not block Kernel Initialization!)
    this._initializeStorageAsync();

    console.log('[DiscoveryManager] Platform:', this.platform);
    console.log('[DiscoveryManager] Device:', this.device);
    console.log('[DiscoveryManager] Capabilities:', this.capabilities);

    this.isInitialized = true;
    this.eventBus.emit('Discovery:Ready', { 
      platform: this.platform, 
      device: this.device, 
      capabilities: this.capabilities,
      timestamp: Date.now() 
    });
  }

  async _initializeStorageAsync() {
    this.storage = await this.getStorageEstimate();
    if (this.eventBus) {
      this.eventBus.emit('Discovery:StorageReady', { storage: this.storage });
    }
  }

  // Detect platform: web, electron, mobile, unknown
  detectPlatform() {
    // ✅ Cek Electron environment DULU
    if (typeof window !== 'undefined' && window.electronAPI) {
      return 'desktop'; // Electron app
    }
    
    // Cek Node.js environment (Electron main process)
    if (typeof process !== 'undefined' && process.versions?.electron) {
      return 'desktop';
    }
    
    // Fallback ke web detection
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
      return 'mobile';
    }
    return 'web';
  }

  // Detect device type: desktop, tablet, phone, unknown
  detectDevice() {
    const userAgent = navigator.userAgent;
    
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      return 'tablet';
    }
    
    if (/mobile|android|iphone|ipod/i.test(userAgent)) {
      return 'phone';
    }
    
    if (/windows|macintosh|linux/i.test(userAgent)) {
      return 'desktop';
    }
    
    return 'unknown';
  }

  // Detect available capabilities
  detectCapabilities() {
    const capabilities = [];
    
    // File System API
    if ('showOpenFilePicker' in window || 'webkitdirectory' in document.createElement('input')) {
      capabilities.push('file-system');
    }
    
    // Clipboard API
    if (navigator.clipboard && navigator.clipboard.readText) {
      capabilities.push('clipboard');
    }
    
    // Notifications API
    if ('Notification' in window) {
      capabilities.push('notification');
    }
    
    // Geolocation API
    if ('geolocation' in navigator) {
      capabilities.push('geolocation');
    }
    
    // Camera/Microphone
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      capabilities.push('camera');
      capabilities.push('microphone');
    }
    
    // Bluetooth
    if ('bluetooth' in navigator) {
      capabilities.push('bluetooth');
    }
    
    // USB
    if ('usb' in navigator) {
      capabilities.push('usb');
    }
    
    // Local Storage
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      capabilities.push('local-storage');
    } catch (e) {}
    
    // IndexedDB
    if ('indexedDB' in window) {
      capabilities.push('indexeddb');
    }
    
    // Service Worker
    if ('serviceWorker' in navigator) {
      capabilities.push('service-worker');
    }
    
    // Web Workers
    if ('Worker' in window) {
      capabilities.push('web-worker');
    }
    
    // WebSocket
    if ('WebSocket' in window) {
      capabilities.push('websocket');
    }
    
    return capabilities;
  }

  // Get network status
  getNetworkStatus() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    return {
      online: navigator.onLine,
      type: connection ? (connection.effectiveType || 'unknown') : 'unknown',
      downlink: connection ? connection.downlink : null,
      rtt: connection ? connection.rtt : null
    };
  }

  // Get screen information
  getScreenInfo() {
    return {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: screen.orientation ? screen.orientation.type : 'unknown',
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    };
  }

  // Get storage estimate
  async getStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          quota: estimate.quota || 0,
          usage: estimate.usage || 0,
          percentage: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0
        };
      } catch (e) {
        console.warn('[DiscoveryManager] Failed to get storage estimate:', e);
      }
    }
    
    return { quota: 0, usage: 0, percentage: 0 };
  }

  // Check if specific feature is available
  isFeatureAvailable(featureName) {
    return this.capabilities.includes(featureName);
  }

  // Get all discovery info
  getDiscoveryInfo() {
    return {
      platform: this.platform,
      device: this.device,
      capabilities: this.capabilities,
      network: this.network,
      screen: this.screen,
      storage: this.storage,
      initialized: this.isInitialized
    };
  }
}
