import { useState, useEffect } from 'react';
import { kernel } from '../Kernel';
import { serviceManager } from '../ServiceManager';

/**
 * useService — Safe React hook untuk mengakses ServiceManager.
 *
 * Masalah yang diselesaikan:
 * Komponen UI yang memanggil serviceManager.get() secara sinkron di body
 * komponen akan crash jika kernel belum selesai boot (terutama di Vercel/production).
 *
 * Solusi:
 * Hook ini mengembalikan null jika kernel belum RUNNING,
 * dan mengembalikan instance service setelah kernel siap.
 *
 * Usage:
 *   const applicationManager = useService('ApplicationManager');
 *   if (!applicationManager) return <LoadingSpinner />;
 */
export function useService(name) {
  const [service, setService] = useState(() => {
    // Coba ambil langsung jika kernel sudah RUNNING
    if (kernel.status === 'RUNNING' && serviceManager.has(name)) {
      return serviceManager.get(name);
    }
    return null;
  });

  useEffect(() => {
    // Jika sudah ada, skip
    if (service) return;

    // Jika kernel sudah RUNNING, ambil langsung
    if (kernel.status === 'RUNNING' && serviceManager.has(name)) {
      setService(serviceManager.get(name));
      return;
    }

    // Kalau belum, tunggu event Kernel:Ready
    let unsubscribe = null;
    const tryGet = () => {
      if (serviceManager.has(name)) {
        setService(serviceManager.get(name));
      }
    };

    // Listen ke EventBus jika sudah tersedia
    const listenOnEventBus = () => {
      try {
        if (serviceManager.has('EventBus')) {
          const eventBus = serviceManager.get('EventBus');
          unsubscribe = eventBus.on('Kernel:BootComplete', tryGet);
          // Coba langsung sekali lagi, mungkin boot sudah selesai
          tryGet();
        }
      } catch (e) {
        // EventBus belum tersedia, polling ringan sekali
        setTimeout(tryGet, 500);
      }
    };

    listenOnEventBus();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [name, service]);

  return service;
}
