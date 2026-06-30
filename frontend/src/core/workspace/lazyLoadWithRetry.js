import { lazy } from 'react';

export function lazyLoadWithRetry(importFn, widgetId) {
  return lazy(async () => {
    let retries = 3;
    const startTime = performance.now();
    let lastError = null;

    while (retries > 0) {
      try {
        const module = await importFn();
        const duration = performance.now() - startTime;
        console.log(`[ModuleLoader] Loaded ${widgetId} in ${duration.toFixed(2)}ms. Remaining retries: ${retries - 1}`);
        return module;
      } catch (error) {
        lastError = error;
        retries--;
        console.warn(`[ModuleLoader] Failed to load chunk for ${widgetId}. Retries left: ${retries}. URL: ${window.location.href}. Version: ${import.meta.env.VITE_APP_VERSION || 'unknown'}`);
        
        if (retries === 0) {
          throw new Error(`Module Load Failure: ${widgetId} - ${error.message}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Attempt to cache bust or force reload on the last retry if it's a ChunkLoadError
        if (retries === 1 && error.message.match(/dynamically imported module/i)) {
             console.warn(`[ModuleLoader] Critical chunk failure detected. This is typically due to a new Vercel deployment replacing older assets. Recovery requires a hard refresh or fallback.`);
        }
      }
    }
    
    throw lastError;
  });
}
