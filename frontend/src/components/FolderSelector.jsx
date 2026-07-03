import React, { useState, useEffect } from 'react';
import { FolderOpen, Folder, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { kernel } from '../core/runtime/Kernel';

/**
 * FolderSelector
 * Komponen untuk memilih folder di sistem operasi.
 * Mode Electron: Menggunakan dialog.showOpenDialog
 * Mode Browser: Fallback ke input file webkitdirectory
 *
 * @param {Object} props
 * @param {Function} props.onSelect - Callback ketika folder dipilih. Menerima path string.
 * @param {string} props.currentPath - Path yang sedang aktif (opsional)
 * @param {boolean} props.showLabel - Tampilkan label teks (default true)
 * @param {string} props.className - Kelas CSS tambahan
 */
export default function FolderSelector({ 
  onSelect, 
  currentPath = '', 
  showLabel = true, 
  className = '' 
}) {
  const [selectedPath, setSelectedPath] = useState(currentPath);
  const [isElectron, setIsElectron] = useState(false);
  const [platform, setPlatform] = useState('web');
  const [error, setError] = useState(null);

  // Deteksi platform dan ketersediaan Electron
  useEffect(() => {
    if (kernel.status !== 'RUNNING' || !kernel.serviceManager) return;

    try {
      const discoveryManager = kernel.serviceManager.get('DiscoveryManager');
      if (discoveryManager) {
        setPlatform(discoveryManager.detectPlatform() || 'web');
      }
    } catch (e) {
      console.warn('[FolderSelector] DiscoveryManager tidak tersedia, fallback ke web');
    }

    // Cek apakah kita berjalan di Electron
    if (window.electronAPI) {
      setIsElectron(true);
    }
  }, []);

  const handleSelectFolder = async () => {
    setError(null);

    if (isElectron && window.electronAPI) {
      // Mode Electron: Gunakan dialog asli
      try {
        const result = await window.electronAPI.openFolderDialog();
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return; // User membatalkan
        }

        const folderPath = result.filePaths[0];
        setSelectedPath(folderPath);
        
        if (onSelect) {
          onSelect(folderPath);
        }

        // Simpan ke StorageManager untuk persistensi
        const storageManager = kernel.serviceManager.get('StorageManager');
        if (storageManager) {
          await storageManager.write('mamet_fs:selectedFolder', folderPath);
        }
      } catch (err) {
        setError(`Gagal membuka folder: ${err.message}`);
        console.error('[FolderSelector] Electron error:', err);
      }
    } else {
      // Mode Browser: Fallback ke input file dengan webkitdirectory
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = false;

      input.onchange = (e) => {
        const files = e.target.files;
        if (files.length > 0) {
          // Di browser, kita tidak bisa mendapatkan path absolut
          // Gunakan nama folder sebagai pengganti
          const folderName = files[0].webkitRelativePath.split('/')[0];
          const pseudoPath = `/browser/${folderName}`;
          setSelectedPath(pseudoPath);
          
          if (onSelect) {
            onSelect(pseudoPath);
          }
        }
      };

      input.click();
    }
  };

  const handleClearSelection = async () => {
    setSelectedPath('');
    setError(null);

    if (onSelect) {
      onSelect('');
    }

    const storageManager = kernel.serviceManager.get('StorageManager');
    if (storageManager) {
      await storageManager.delete('mamet_fs:selectedFolder');
    }
  };

  // Ekstrak nama folder dari path untuk tampilan
  const getFolderName = (path) => {
    if (!path) return '';
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className={`folder-selector ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSelectFolder}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 transition-colors"
          title="Pilih folder"
        >
          <FolderOpen className="w-5 h-5 text-emerald-400" />
          {showLabel && <span className="text-sm">Pilih Folder</span>}
        </button>

        {selectedPath && (
          <button
            onClick={handleClearSelection}
            className="p-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-red-400 transition-colors"
            title="Hapus folder"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tampilan path yang dipilih */}
      {selectedPath && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Folder className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-slate-300 truncate max-w-[250px]" title={selectedPath}>
            {getFolderName(selectedPath)}
          </span>
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-emerald-400 text-xs">Dipilih</span>
        </div>
      )}

      {/* Tidak ada folder dipilih */}
      {!selectedPath && (
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <Folder className="w-4 h-4 shrink-0" />
          <span>Belum ada folder yang dipilih</span>
        </div>
      )}

      {/* Indikator platform */}
      <div className="mt-2 text-xs text-slate-600">
        {isElectron ? (
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            Mode Desktop (Electron) — Akses penuh ke file system
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            Mode Browser — Akses terbatas, gunakan upload
          </span>
        )}
      </div>

      {/* Pesan error */}
      {error && (
        <div className="mt-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  );
}