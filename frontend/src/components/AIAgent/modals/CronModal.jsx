/**
 * CronModal.jsx
 *
 * Modal untuk menambah/mengedit jadwal Cron (Tugas Otomatis).
 * Diekstrak dari AIAgent.jsx (baris 2077-2149).
 *
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - cronForm: { id, title, prompt, interval_hours }
 *   - setCronForm: React setState function
 *   - onSubmit: (e) => void
 *   - isLoading: boolean
 *
 * DEBUG POINTS:
 *   - cronForm.id: jika ada → mode Edit, jika kosong → mode Tambah
 *   - onSubmit: cek response Supabase jika data tidak tersimpan
 */
import React from 'react';
import { Clock, X } from 'lucide-react';

export default function CronModal({
  isOpen,
  onClose,
  cronForm,
  setCronForm,
  onSubmit,
  isLoading
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="p-4 border-b border-purple-500/20 flex justify-between items-center bg-slate-800/50">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            {cronForm.id ? 'Edit Jadwal Agen (Cron)' : 'Tambah Jadwal Agen (Cron)'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-4">

          {/* Judul Tugas */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Judul Tugas</label>
            <input
              type="text"
              required
              value={cronForm.title}
              onChange={e => setCronForm({ ...cronForm, title: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              placeholder="Cth: Riset Harga Kripto Harian"
            />
          </div>

          {/* Instruksi Prompt */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Instruksi Prompt</label>
            <textarea
              required
              value={cronForm.prompt}
              onChange={e => setCronForm({ ...cronForm, prompt: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 h-24 resize-none focus:outline-none focus:border-emerald-500"
              placeholder="Ketik prompt lengkap di sini..."
            />
          </div>

          {/* Jadwal Eksekusi */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Jadwal Eksekusi</label>
            <select
              value={cronForm.interval_hours}
              onChange={e => setCronForm({ ...cronForm, interval_hours: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value={1}>Setiap 1 Jam</option>
              <option value={6}>Setiap 6 Jam</option>
              <option value={12}>Setiap 12 Jam</option>
              <option value={24}>Setiap 24 Jam (Harian)</option>
              <option value={168}>Setiap 7 Hari (Mingguan)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isLoading ? 'Menyimpan...' : 'Simpan Jadwal'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
