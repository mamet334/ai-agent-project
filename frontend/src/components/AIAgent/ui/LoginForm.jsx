/**
 * LoginForm.jsx
 *
 * Form autentikasi (Login / Sign Up) yang tampil jika user belum login.
 * Diekstrak dari AIAgent.jsx (baris 762-805).
 *
 * Props:
 *   - isLoginMode: boolean
 *   - setIsLoginMode: React setState function
 *   - authEmail: string
 *   - setAuthEmail: React setState function
 *   - authPassword: string
 *   - setAuthPassword: React setState function
 *   - authError: string | null
 *   - authLoading: boolean
 *   - onSubmit: (e) => void
 *
 * DEBUG POINTS:
 *   - onSubmit: cek supabase.auth.signInWithPassword jika login gagal
 *   - authError: lihat pesan error dari Supabase (email not confirmed, wrong password, dll)
 *   - authLoading: harus false setelah request selesai, jika tidak → cek try/finally
 */
import React from 'react';
import { Zap, Mail, Lock } from 'lucide-react';

export default function LoginForm({
  isLoginMode,
  setIsLoginMode,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authError,
  authLoading,
  onSubmit
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden text-white">
      {/* Background blobs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-40 right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700" />

      <div className="z-10 bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-purple-500/30 w-full max-w-md shadow-2xl">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-slate-800/80 border border-white/10 rounded-2xl flex items-center justify-center shadow-lg text-purple-400">
            <Zap className="w-8 h-8 text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-2 text-slate-100">AI Agent Platform</h2>
        <p className="text-center text-slate-400 mb-8 text-sm">
          {isLoginMode ? 'Login untuk menyimpan memori AI Anda' : 'Buat akun untuk memulai'}
        </p>

        {/* Auth Form */}
        <form onSubmit={onSubmit} className="space-y-4">

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 transition-all text-white"
                placeholder="nama@email.com"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 transition-all text-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Error */}
          {authError && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
              {authError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={authLoading}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-all shadow-lg shadow-purple-500/30 border border-white/10"
          >
            {authLoading ? 'Memproses...' : (isLoginMode ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="mt-6 text-center text-sm text-slate-400">
          {isLoginMode ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button
            onClick={() => setIsLoginMode(!isLoginMode)}
            className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
          >
            {isLoginMode ? 'Daftar sekarang' : 'Login di sini'}
          </button>
        </div>

      </div>
    </div>
  );
}
