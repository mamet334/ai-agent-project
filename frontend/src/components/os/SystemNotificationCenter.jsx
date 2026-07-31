import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useService } from '../../core/runtime/hooks/useService';

/**
 * SystemNotificationCenter — Menampilkan notifikasi sistem (System:Degraded, System:Error)
 * sebagai toast di pojok kanan bawah layar.
 *
 * Mendengarkan event dari EventBus:
 *   - System:Degraded → { reason, phase }
 *   - System:Error    → { reason, phase }
 *
 * Setiap notifikasi otomatis hilang setelah 10 detik.
 */
export default function SystemNotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const eventBus = useService('EventBus');
  const timersRef = useRef({});

  // Hapus notifikasi berdasarkan ID
  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  // Tambah notifikasi baru
  const addNotification = useCallback((type, payload) => {
    const id = `sys-notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const notification = {
      id,
      type, // 'DEGRADED' | 'ERROR'
      reason: payload?.reason || 'Tidak ada detail',
      phase: payload?.phase ?? 'N/A',
      timestamp: Date.now(),
    };

    setNotifications((prev) => [...prev, notification]);

    // Auto-dismiss setelah 10 detik
    timersRef.current[id] = setTimeout(() => {
      dismissNotification(id);
    }, 10000);
  }, [dismissNotification]);

  // Daftarkan listener EventBus saat komponen mount
  useEffect(() => {
    if (!eventBus) return;

    const unsubDegraded = eventBus.on('System:Degraded', (wrappedPayload) => {
      const payload = wrappedPayload?.data || wrappedPayload;
      addNotification('DEGRADED', payload);
    });

    const unsubError = eventBus.on('System:Error', (wrappedPayload) => {
      const payload = wrappedPayload?.data || wrappedPayload;
      addNotification('ERROR', payload);
    });

    // Cleanup: unsubscribe semua listener + bersihkan timer
    return () => {
      if (typeof unsubDegraded === 'function') unsubDegraded();
      if (typeof unsubError === 'function') unsubError();

      // Bersihkan semua timer yang masih aktif
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
      timersRef.current = {};
    };
  }, [eventBus, addNotification]);

  // Jika tidak ada notifikasi, jangan render apa pun
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`
            pointer-events-auto
            max-w-sm w-80
            rounded-lg border
            shadow-2xl
            backdrop-blur-md
            p-4
            animate-slide-in-right
            transition-all duration-300
            ${
              notif.type === 'ERROR'
                ? 'bg-red-950/90 border-red-500/70 text-red-100'
                : 'bg-orange-950/90 border-orange-500/70 text-orange-100'
            }
          `}
          role="alert"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* Icon */}
              <span className="text-lg">
                {notif.type === 'ERROR' ? '🔴' : '🟡'}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                {notif.type === 'ERROR' ? 'System Error' : 'System Degraded'}
              </span>
            </div>
            {/* Tombol close */}
            <button
              onClick={() => dismissNotification(notif.id)}
              className="text-white/50 hover:text-white/90 transition-colors text-sm leading-none"
              aria-label="Tutup notifikasi"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="mt-2 text-sm space-y-1">
            <p className="text-white/90 break-words">
              {notif.reason}
            </p>
            {notif.phase !== 'N/A' && (
              <p className="text-white/50 text-xs">
                Fase boot: <span className="font-mono">{notif.phase}</span>
              </p>
            )}
          </div>

          {/* Progress bar auto-dismiss */}
          <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full animate-shrink-width ${
                notif.type === 'ERROR' ? 'bg-red-400' : 'bg-orange-400'
              }`}
              style={{
                animation: 'shrink-width 10s linear forwards',
              }}
            />
          </div>
        </div>
      ))}

      {/* Animasi keyframes — di-inject via style tag */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes shrink-width {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
