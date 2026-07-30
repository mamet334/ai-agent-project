import React, { useEffect, useState } from 'react';
import { useService } from '../../core/runtime/hooks/useService';
import { X } from 'lucide-react';

/**
 * OS Sidebar — Responsive
 *
 * Desktop : fixed sidebar kiri, lebar w-16, selalu tampil
 * Mobile  : drawer overlay dari kiri, disembunyikan saat tertutup
 *           Dikontrol via props isMobile, isOpen, onClose dari OSDesktopShell
 */
export default function Sidebar({ isMobile = false, isOpen = false, onClose }) {
  const applicationManager = useService('ApplicationManager');
  const navigationService = useService('NavigationService');

  const [appState, setAppState] = useState({ apps: [], activeAppId: null });
  const [navTree, setNavTree] = useState([]);

  // Sync state saat service tersedia
  useEffect(() => {
    if (applicationManager) {
      setAppState(applicationManager.getState());
    }
  }, [applicationManager]);

  useEffect(() => {
    if (navigationService) {
      setNavTree(navigationService.getTree() || []);
    }
  }, [navigationService]);

  useEffect(() => {
    if (!applicationManager) return;
    const unsub = applicationManager.subscribe((payload) => {
      setAppState(payload?.data || payload);
      if (navigationService) setNavTree(navigationService.getTree());
    });
    return () => unsub();
  }, [applicationManager, navigationService]);

  const activate = (id) => {
    if (appState.apps.find(a => a.id === id)) {
      applicationManager.activateApp(id);
    }
    // Tutup drawer setelah navigasi di mobile
    if (isMobile && onClose) onClose();
  };

  const isActive = (id) => appState.activeAppId === id;

  const getIcon = (appName = '') => {
    const lower = appName.toLowerCase();
    if (lower.includes('home'))      return 'home';
    if (lower.includes('assistant')) return 'chat_bubble';
    if (lower.includes('lite'))      return 'bolt';
    if (lower.includes('engineer'))  return 'terminal';
    if (lower.includes('settings'))  return 'settings';
    if (lower.includes('knowledge')) return 'menu_book';
    if (lower.includes('memory'))    return 'database';
    if (lower.includes('forge'))     return 'architecture';
    return 'apps';
  };

  const renderNavNode = (node, idx) => {
    if (node.type === 'separator') return null;
    if (node.type === 'spacer') return <div key={`spacer-${idx}`} className="mt-auto" />;
    
    if (node.type === 'item' || node.appId) {
      const app = node.app;
      if (!app || app.id === 'app:settings') return null;
      const active = isActive(app.id);
      
      return (
        <a
          key={app.id}
          href="#"
          onClick={(e) => { e.preventDefault(); activate(app.id); }}
          title={app.name}
          className={`flex items-center gap-3 rounded-xl transition-all duration-200 relative group
            ${isMobile
              // Mobile drawer: tampilkan label di samping ikon
              ? `px-4 py-3 mx-2 ${active
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                }`
              // Desktop: ikon saja, centered
              : `justify-center w-10 h-10 mx-auto ${active
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:bg-surface-variant'
                }`
            }`}
        >
          {active && !isMobile && (
            <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
          )}
          <span
            className={`material-symbols-outlined shrink-0 ${active ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface'}`}
            style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0", fontSize: isMobile ? '22px' : '22px' }}
          >
            {getIcon(app.name)}
          </span>
          {/* Label hanya tampil di mobile drawer */}
          {isMobile && (
            <span className={`text-sm font-medium ${active ? 'text-on-secondary-container' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
              {app.name}
            </span>
          )}
        </a>
      );
    }
    
    if (node.type === 'group') {
      return (
        <div key={`group-${node.name}`} className={isMobile ? 'mb-2' : 'mb-4 space-y-1'}>
          {isMobile && node.name && (
            <p className="px-6 py-1 text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-widest">
              {node.name}
            </p>
          )}
          {node.items.map((subItem, sIdx) => renderNavNode(subItem, `${idx}-${sIdx}`))}
        </div>
      );
    }
    return null;
  };

  // ── DESKTOP SIDEBAR ──
  const desktopSidebar = (
    <aside className="fixed left-0 top-0 h-screen w-16 flex flex-col items-center bg-surface-container-low border-r border-outline-variant z-40 py-4">
      {/* Logo/Icon */}
      <div className="flex flex-col gap-1 items-center mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
        </div>
      </div>
      
      <nav className="flex-1 w-full space-y-2 custom-scrollbar overflow-y-auto">
        {navTree.map((node, idx) => renderNavNode(node, idx))}
      </nav>
      
      {/* Footer: Settings & User */}
      <div className="w-full flex flex-col items-center gap-2 mt-auto pt-4 border-t border-outline-variant/30">
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); activate('app:settings'); }}
          title="Settings"
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors relative ${isActive('app:settings') ? 'text-primary bg-secondary-container' : 'text-on-surface-variant hover:bg-surface-variant'}`}
        >
          {isActive('app:settings') && <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
          <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive('app:settings') ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
        </a>
        <div className="mt-2 flex items-center justify-center">
          <div
            onClick={() => activate('app:settings')}
            className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center border border-outline-variant relative cursor-pointer hover:border-primary transition-colors"
            title="User"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">person</span>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-primary animate-pulse border border-surface-container-low"></span>
          </div>
        </div>
      </div>
    </aside>
  );

  // ── MOBILE DRAWER ──
  const mobileDrawer = (
    <aside
      className={`fixed left-0 top-0 h-screen w-72 flex flex-col bg-surface-container-low border-r border-outline-variant z-40 transition-transform duration-300 ease-in-out shadow-2xl
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Header drawer */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-outline-variant/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
          </div>
          <div>
            <p className="text-sm font-bold text-on-surface">Mamet OS</p>
            <p className="text-[10px] text-on-surface-variant">MAEF Engine</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
          title="Tutup"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav list */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 custom-scrollbar">
        {navTree.map((node, idx) => renderNavNode(node, idx))}
        {/* Settings di dalam drawer */}
        <div className="mx-2 mt-2">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); activate('app:settings'); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group
              ${isActive('app:settings')
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
              }`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: isActive('app:settings') ? "'FILL' 1" : "'FILL' 0" }}
            >
              settings
            </span>
            <span className="text-sm font-medium">Settings</span>
          </a>
        </div>
      </nav>
    </aside>
  );

  if (isMobile) return mobileDrawer;
  return desktopSidebar;
}
