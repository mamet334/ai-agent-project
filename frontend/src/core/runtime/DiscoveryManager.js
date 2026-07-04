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
    this.storage = await this.getStorageEstimate();

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

  // Detect platform: web, electron, mobile, unknown
  detectPlatform() {
    // Check for Electron
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      return 'electron';
    }
    
    // Check for mobile (basic detection)
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return 'mobile';
    }
    
    // Default to web
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
        // Add a 500ms timeout to prevent Firefox/browser hanging issues during boot
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('storage.estimate timeout')), 500)
        );
        const estimate = await Promise.race([
          navigator.storage.estimate(),
          timeoutPromise
        ]);
        
        return {
          quota: estimate.quota || 0,
          usage: estimate.usage || 0,
          percentage: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0
        };
      } catch (e) {
        console.warn('[DiscoveryManager] Failed to get storage estimate:', e.message || e);
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
