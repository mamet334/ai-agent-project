import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { kernel } from './core/runtime/Kernel.js'
import { serviceManager } from './core/runtime/ServiceManager.js'

console.log('[LIFECYCLE] Runtime initialized');

async function bootstrapOS() {
  let bootError = null;

  try {
    console.log('[LIFECYCLE] Booting Kernel...');
    await kernel.boot(serviceManager);
    
    // =========================================================
    // 🔽 TAMBAHKAN KODE INI DI SINI (Setelah boot Kernel sukses)
    // =========================================================
    // Hanya ekspos untuk debugging di mode development
    if (import.meta.env.DEV) {
      window.__mamet = { serviceManager };
      console.log('🔧 Dev Mode: ServiceManager exposed to window.__mamet for debugging.');
    }
    // =========================================================

    console.log('[LIFECYCLE] Kernel Boot Complete. Mounting UI.');
  } catch (error) {
    console.error('[LIFECYCLE] Kernel Boot Failed:', error);
    bootError = error;
  }

  // Jika boot gagal, render error page — jangan OS shell
  // Ini mencegah komponen seperti Sidebar memanggil serviceManager.get() pada service yang belum terdaftar
  if (bootError) {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#020817', color: '#ef4444',
        fontFamily: 'monospace', flexDirection: 'column', gap: '16px', padding: '24px'
      }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>MAMET OS KERNEL PANIC</div>
        <div style={{ color: '#94a3b8', fontSize: '13px' }}>An unexpected runtime error occurred during boot.</div>
        <div style={{
          background: '#0f172a', padding: '16px', borderRadius: '8px',
          maxWidth: '600px', width: '100%', fontSize: '12px', color: '#f87171',
          border: '1px solid #1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          {bootError.message || String(bootError)}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 24px', background: '#1e293b', color: '#94a3b8',
            border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer',
            fontFamily: 'monospace', fontSize: '12px'
          }}
        >
          REBOOT OS
        </button>
      </div>
    );
    return;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

bootstrapOS();