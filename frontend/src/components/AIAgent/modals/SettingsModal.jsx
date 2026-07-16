/**
 * SettingsModal.jsx
 *
 * Modal pengaturan BYOK (Bring Your Own Key) dan fitur keamanan darurat.
 * Diekstrak dari AIAgent.jsx (baris 2151-2246).
 *
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - byokKeys: { openai, groq, openrouter, gemini }
 *   - setByokKeys: React setState function
 *   - onSave: () => void
 *   - onKillSwitch: () => void
 *   - onClearMemory: () => void
 *
 * DEBUG POINTS:
 *   - byokKeys: verifikasi key tersimpan di localStorage dengan key 'x-byok-*'
 *   - onKillSwitch: cek endpoint Supabase jika cron tidak berhenti
 *   - onClearMemory: cek endpoint RAG jika dokumen tidak terhapus
 */
import React from 'react';
import { Lock, X, AlertTriangle, BrainCircuit } from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  byokKeys,
  setByokKeys,
  onSave,
  onKillSwitch,
  onClearMemory
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md shadow-2xl shadow-purple-500/20 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/20 bg-slate-800/50 flex-shrink-0">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-400" />
            Bring Your Own Key (BYOK)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <p className="text-xs text-slate-400 mb-4">
            Masukkan API Key milik Anda sendiri untuk menggunakan model tanpa memotong kuota pusat.
            Key disimpan secara aman di browser Anda.
          </p>

          {/* OpenAI */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">OpenAI API Key (ChatGPT)</label>
            <input
              type="password"
              value={byokKeys.openai}
              onChange={(e) => setByokKeys({ ...byokKeys, openai: e.target.value })}
              placeholder="sk-..."
              className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Groq */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">Groq API Key (Llama 3)</label>
            <input
              type="password"
              value={byokKeys.groq}
              onChange={(e) => setByokKeys({ ...byokKeys, groq: e.target.value })}
              placeholder="gsk_..."
              className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* OpenRouter */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">OpenRouter API Key (DeepSeek)</label>
            <input
              type="password"
              value={byokKeys.openrouter}
              onChange={(e) => setByokKeys({ ...byokKeys, openrouter: e.target.value })}
              placeholder="sk-or-v1-..."
              className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Gemini */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 ml-1">Gemini API Key</label>
            <input
              type="password"
              value={byokKeys.gemini}
              onChange={(e) => setByokKeys({ ...byokKeys, gemini: e.target.value })}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Emergency Security Section */}
          <div className="pt-4 border-t border-slate-700/50 space-y-3">
            <h4 className="text-xs font-semibold text-rose-400 mb-2">Pusat Keamanan Darurat</h4>

            <button
              onClick={onKillSwitch}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600/10 text-rose-400 border border-rose-600/30 hover:bg-rose-600 hover:text-white transition-all text-sm font-medium"
            >
              <AlertTriangle className="w-4 h-4" /> KILL SWITCH (Matikan Cron)
            </button>

            <button
              onClick={onClearMemory}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600/10 text-amber-400 border border-amber-600/30 hover:bg-amber-600 hover:text-white transition-all text-sm font-medium"
            >
              <BrainCircuit className="w-4 h-4" /> Bakar Semua Ingatan RAG
            </button>
          </div>

          {/* Save / Cancel */}
          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-700/50 text-slate-300 hover:bg-slate-800 transition-all text-sm font-medium"
            >
              Batal
            </button>
            <button
              onClick={onSave}
              className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20 transition-all text-sm font-medium"
            >
              Simpan Key
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
