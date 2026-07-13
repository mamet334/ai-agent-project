import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { kernel } from './core/runtime/Kernel.js'
import { serviceManager } from './core/runtime/ServiceManager.js'

console.log('[LIFECYCLE] Runtime initialized');

async function bootstrapOS() {
  try {
    console.log('[LIFECYCLE] Booting Kernel...');
    await kernel.boot(serviceManager);
    console.log('[LIFECYCLE] Kernel Boot Complete. Mounting UI.');
  } catch (error) {
    console.error('[LIFECYCLE] Kernel Boot Failed:', error);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

bootstrapOS();