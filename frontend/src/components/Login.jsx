import React, { useState } from 'react';
import { supabase } from '../supabase';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      onLoginSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen dark">
      {/* TopNavBar */}
      <header className="w-full top-0 left-0 bg-surface dark:bg-surface border-b border-outline-variant/10 z-50">
        <div className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 w-full max-w-container-max mx-auto">
          <div className="font-headline-md text-headline-md font-bold text-on-surface">Mamet OS Ecosystem</div>
          <nav className="hidden md:flex items-center gap-8"></nav>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center relative px-margin-mobile py-12 overflow-hidden bg-[#0a0a0c]">
        {/* Atmospheric Background Animation */}
        <div className="relative w-full max-w-md z-10">
          {/* Center Card */}
          <div className="glass-panel rim-light rounded-xl p-8 md:p-10">
            <div className="text-center mb-10">
              <h1 className="font-headline-md text-headline-md text-on-surface mb-2">
                {isSignUp ? 'Buat Akun' : 'Selamat Datang'}
              </h1>
              <p className="font-body-base text-body-base text-on-surface-variant">
                {isSignUp ? 'Daftarkan diri Anda untuk masuk ke ruang kerja' : 'Masuk ke ruang kerja pribadi Anda'}
              </p>
            </div>
            
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Email Field */}
              <div className="space-y-2">
                <label className="block font-label-mono text-label-mono text-secondary uppercase tracking-wider" htmlFor="email">Email</label>
                <input 
                  className="w-full px-4 py-3 rounded-DEFAULT font-body-base text-body-base text-on-surface input-etched" 
                  id="email" 
                  placeholder="nama@email.com" 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block font-label-mono text-label-mono text-secondary uppercase tracking-wider" htmlFor="password">Kata Sandi</label>
                  {!isSignUp && (
                    <a className="font-label-mono text-label-mono text-primary hover:underline transition-all" href="#">Lupa Kata Sandi?</a>
                  )}
                </div>
                <input 
                  className="w-full px-4 py-3 rounded-DEFAULT font-body-base text-body-base text-on-surface input-etched" 
                  id="password" 
                  placeholder="••••••••" 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-error-container/30 border border-error-container rounded-lg text-error text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Primary Button */}
              <button 
                className="w-full py-4 bg-primary-container text-on-primary-container font-headline-md text-[16px] font-bold rounded-DEFAULT btn-glow transition-all duration-200 ease-in-out active:scale-[0.98] flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>{isSignUp ? 'Daftar' : 'Masuk'}</>
                )}
              </button>

              <div className="text-center mt-4">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {isSignUp ? 'Sudah punya akun? ' : 'Belum punya akun? '}
                  <button 
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError(null);
                    }}
                    className="text-primary hover:underline transition-all"
                  >
                    {isSignUp ? 'Masuk' : 'Daftar'}
                  </button>
                </p>
              </div>
            </form>
          </div>

          {/* Contextual Decorative Elements */}
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-secondary/5 blur-[80px] rounded-full pointer-events-none"></div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bottom-0 bg-surface dark:bg-surface border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-mobile md:px-margin-desktop py-8 w-full max-w-container-max mx-auto gap-4">
          <div className="font-label-mono text-label-mono text-on-surface">@2026 mametdev</div>
        </div>
      </footer>
    </div>
  );
}
