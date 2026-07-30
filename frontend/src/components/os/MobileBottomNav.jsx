import React from 'react';
import { useService } from '../../core/runtime/hooks/useService';

/**
 * MobileBottomNav
 * Bottom navigation bar untuk perangkat mobile (< 768px).
 * Menampilkan ikon navigasi utama di bagian bawah layar — mirip native mobile app.
 * Di desktop komponen ini tidak dirender (disembunyikan via kondisi di OSDesktopShell).
 */
export default function MobileBottomNav({ onMenuOpen }) {
  const applicationManager = useService('ApplicationManager');
  const navigationService = useService('NavigationService');

  const [appState, setAppState] = React.useState({ apps: [], activeAppId: null });
  const [navTree, setNavTree] = React.useState([]);

  React.useEffect(() => {
    if (applicationManager) setAppState(applicationManager.getState());
  }, [applicationManager]);

  React.useEffect(() => {
    if (navigationService) setNavTree(navigationService.getTree() || []);
  }, [navigationService]);

  React.useEffect(() => {
    if (!applicationManager) return;
    const unsub = applicationManager.subscribe((payload) => {
      setAppState(payload?.data || payload);
      if (navigationService) setNavTree(navigationService.getTree());
    });
    return () => unsub();
  }, [applicationManager, navigationService]);

  const activate = (id) => {
    if (appState?.apps?.find(a => a.id === id)) {
      applicationManager.activateApp(id);
    }
  };

  const isActive = (id) => appState?.activeAppId === id;

  // Ambil item navigasi utama (max 5 agar muat di layar kecil)
  const navItems = navTree
    .filter(n => n.type === 'item' && n.app && !n.app.id?.includes('settings'))
    .slice(0, 4);

  // Fungsi map icon nama app → material symbol
  const getIcon = (appName = '') => {
    const lower = appName.toLowerCase();
    if (lower.includes('home'))      return 'home';
    if (lower.includes('assistant')) return 'chat_bubble';
    if (lower.includes('lite'))      return 'bolt';
    if (lower.includes('engineer'))  return 'terminal';
    if (lower.includes('knowledge')) return 'menu_book';
    if (lower.includes('memory'))    return 'database';
    if (lower.includes('forge'))     return 'architecture';
    return 'apps';
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center justify-around
        bg-surface-container-low/95 backdrop-blur-lg border-t border-outline-variant
        safe-area-pb"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Tombol Menu (buka sidebar drawer) */}
      <button
        onClick={onMenuOpen}
        className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl
          text-on-surface-variant hover:text-on-surface transition-colors"
        title="Menu"
      >
        <span className="material-symbols-outlined text-[22px]">menu</span>
        <span className="text-[9px] font-medium uppercase tracking-wider">Menu</span>
      </button>

      {/* Nav Items dari metadata */}
      {navItems.map((node) => {
        const app = node.app;
        const active = isActive(app.id);
        const icon = getIcon(app.name);
        return (
          <button
            key={app.id}
            onClick={() => activate(app.id)}
            className={`relative flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all
              ${active
                ? 'text-primary'
                : 'text-on-surface-variant hover:text-on-surface'
              }`}
            title={app.name}
          >
            {active && (
              <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-primary rounded-full" />
            )}
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
              {icon}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wider truncate max-w-[52px]">
              {app.name}
            </span>
          </button>
        );
      })}

      {/* Tombol Settings selalu ada */}
      <button
        onClick={() => activate('app:settings')}
        className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors
          ${isActive('app:settings') ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        title="Settings"
      >
        <span
          className="material-symbols-outlined text-[22px]"
          style={{ fontVariationSettings: isActive('app:settings') ? "'FILL' 1" : "'FILL' 0" }}
        >
          settings
        </span>
        <span className="text-[9px] font-medium uppercase tracking-wider">Settings</span>
      </button>
    </nav>
  );
}
