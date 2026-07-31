import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import ApplicationContainer from './ApplicationContainer';
import MobileBottomNav from './MobileBottomNav';
import SystemNotificationCenter from './SystemNotificationCenter';

export default function OSDesktopShell() {
  // ... kode lainnya ...
  return (
    <>
      <SystemNotificationCenter /> {/* Tambahkan di sini */}
      <ActivityBar />
      <div className="flex flex-1 overflow-hidden">
         {/* ... sisa kode shell Anda ... */}
      </div>
    </>
  );
}


/**
 * OSDesktopShell — Responsive Layout Shell
 *
 * Breakpoints:
 *  - Mobile  (< 768px)  : sidebar = drawer overlay dari kiri, bottom nav bar aktif, content full-width
 *  - Tablet  (768–1024) : sidebar fixed w-16 selalu tampil, content ml-16
 *  - Desktop (> 1024px) : same as tablet, semua elemen tampil penuh
 */
export default function OSDesktopShell() {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Saat resize dari mobile ke desktop, tutup drawer
      if (!mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-surface font-body-base selection:bg-primary/30">

      {/* ── SIDEBAR ── */}
      {/* Desktop: fixed sidebar kiri, selalu visible */}
      {/* Mobile: drawer overlay yang bisa dibuka/tutup */}
      <Sidebar isMobile={isMobile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Backdrop gelap saat drawer mobile terbuka */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── MAIN CONTENT ── */}
      {/* Desktop: geser kanan sejauh lebar sidebar (ml-16) */}
      {/* Mobile: full-width (ml-0), beri padding bawah untuk bottom nav (pb-16) */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${isMobile ? 'pb-16' : 'ml-16'}`}>
        <ApplicationContainer />
      </div>

      {/* ── BOTTOM NAV BAR ── hanya di mobile */}
      {isMobile && (
        <MobileBottomNav onMenuOpen={() => setSidebarOpen(true)} />
      )}
    </div>
  );
}
