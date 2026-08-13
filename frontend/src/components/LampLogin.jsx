import React, { useState } from 'react';
import { supabase } from '../supabase';
import { AlertCircle, Loader2, Eye, EyeOff, Cpu } from 'lucide-react';

export default function LampLogin({ onLoginSuccess }) {
  // State lampu dan login
  const [lampOn, setLampOn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      onLoginSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleLamp = () => setLampOn(prev => !prev);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b0806] isolate flex items-center justify-center">
      
      {/* CSS Khusus untuk mengatasi Auto-fill Chrome */}
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px rgba(5,5,5,.25) inset !important;
            -webkit-text-fill-color: #fff5e6 !important;
            transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {/* =========================================================
          LAYER 1: GRADIEN DASAR DINDING
          ========================================================= */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_72%_at_39%_56%,rgba(119,70,35,.68)_0%,rgba(78,43,23,.48)_32%,rgba(42,24,15,.72)_64%,#0b0705_100%),linear-gradient(180deg,#21140c,#3a2113_50%,#17100b)] transition-all duration-900" />

      {/* =========================================================
          LAYER 2: TEKSTUR DINDING REALISTIS (NOISE / GRAIN)
          ========================================================= */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px'
        }}
      />

      {/* =========================================================
          LAYER 3: BAYANGAN PINGGIR DINDING (VIGNETTE)
          ========================================================= */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/43 via-transparent via-78% to-black/52" />

      {/* =========================================================
          ✨ BRANDING MAMET OS — TENGAH, TURUN, & BESAR
          ========================================================= */}
      <div 
        className="absolute top-[18%] lg:top-[22%] left-1/2 -translate-x-1/2 flex items-center gap-3 lg:gap-5 pointer-events-none z-10 select-none whitespace-nowrap"
      >
        <Cpu className="w-10 h-10 lg:w-16 lg:h-16 text-[#ffe3b3] drop-shadow-[0_0_15px_rgba(255,220,150,0.4)]" />
        <span 
          className="text-[#fff8ec] tracking-[0.1em] lg:tracking-[0.2em] uppercase font-mono text-2xl lg:text-6xl font-light"
          style={{
            textShadow: `
              0 0 10px rgba(255, 220, 150, 0.6),
              0 0 20px rgba(255, 220, 150, 0.4),
              0 0 40px rgba(255, 200, 100, 0.2),
              0 0 80px rgba(255, 180, 80, 0.1)
            `
          }}
        >
          Mamet OS Ecosystem
        </span>
      </div>

      {/* =========================================================
          LIGHT FIELD (Pantulan Cahaya)
          ========================================================= */}
      <div className={`absolute left-[2%] top-[3%] w-[75%] h-[84%] pointer-events-none z-[2] transition-all duration-900 ${lampOn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="absolute left-[9%] top-[12%] w-[68%] h-[72%] bg-[radial-gradient(ellipse_at_47%_57%,rgba(255,191,88,.30)_0%,rgba(231,143,52,.18)_25%,rgba(190,100,31,.07)_49%,transparent_73%)] blur-[27px]" />
        <div className="absolute left-[4%] bottom-0 w-[72%] h-[27%] bg-[radial-gradient(ellipse_at_38%_20%,rgba(255,188,82,.30),rgba(215,119,37,.10)_43%,transparent_74%)] blur-[17px]" />
      </div>

      {/* =========================================================
          DESK & HORIZON
          ========================================================= */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[radial-gradient(ellipse_42%_70%_at_32%_0%,rgba(202,126,58,.27),transparent_72%),linear-gradient(180deg,#63391d,#3b2112_15%,#1a0e08_55%,#080605)] shadow-[inset_0_5px_13px_rgba(255,184,91,.08),inset_0_-20px_35px_rgba(0,0,0,.46)] transition-all duration-900" />
      <div className="absolute inset-x-0 bottom-[13%] h-[3px] z-[6] bg-[#0d0805] shadow-[0_-1px_3px_rgba(255,178,86,.09),0_3px_14px_#000]" />

      {/* =========================================================
          LAMP SVG (Fisik Lampu & Sakelar)
          ========================================================= */}
      <div className="absolute left-[4%] bottom-[12.5%] w-[min(46vw,560px)] h-[min(68vw,680px)] z-[10] drop-shadow-[10px_14px_12px_rgba(0,0,0,.55)]">
        <svg viewBox="0 0 560 680" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="metal" x1="0" x2="1">
              <stop offset="0" stopColor="#090807" />
              <stop offset=".28" stopColor="#38200f" />
              <stop offset=".48" stopColor="#a75d20" />
              <stop offset=".56" stopColor="#e09a43" />
              <stop offset=".67" stopColor="#713b16" />
              <stop offset="1" stopColor="#0a0807" />
            </linearGradient>
            <linearGradient id="shade" x1="0" x2="1">
              <stop offset="0" stopColor="#6a3919" />
              <stop offset=".20" stopColor="#a95f28" />
              <stop offset=".47" stopColor="#d88b42" />
              <stop offset=".75" stopColor="#9a5423" />
              <stop offset="1" stopColor="#4d2915" />
            </linearGradient>
            <radialGradient id="bulb">
              <stop offset="0" stopColor="#fffde8" />
              <stop offset=".25" stopColor="#fff3b7" />
              <stop offset=".7" stopColor="#ffc65c" />
              <stop offset="1" stopColor="#d97720" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="base" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3b2110" />
              <stop offset=".22" stopColor="#160d08" />
              <stop offset=".7" stopColor="#080706" />
              <stop offset="1" stopColor="#020202" />
            </linearGradient>
            <radialGradient id="switchMetal">
              <stop offset="0" stopColor="#dca35b" />
              <stop offset=".35" stopColor="#8a4d1c" />
              <stop offset=".72" stopColor="#2b170c" />
              <stop offset="1" stopColor="#070605" />
            </radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="11" /></filter>
            <filter id="softGlow"><feGaussianBlur stdDeviation="4" /></filter>
            <filter id="switchShadow">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity=".75" />
            </filter>
          </defs>

          <path d="M105 610 C92 430 92 255 182 137 C243 57 335 57 402 57" fill="none" stroke="#050505" strokeWidth="29" strokeLinecap="round" />
          <path d="M112 607 C104 432 105 270 190 151 C247 72 333 71 401 71" fill="none" stroke="url(#metal)" strokeWidth="15" strokeLinecap="round" />
          <path d="M113 605 C107 424 112 275 194 159 C249 82 332 81 398 81" fill="none" stroke="rgba(255,181,85,.52)" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="365" y="65" width="28" height="43" rx="7" fill="#24150b" />
          <rect x="371" y="68" width="15" height="40" rx="5" fill="url(#metal)" />
          <path d="M317 105 Q385 86 455 108 L468 257 Q386 280 302 257 Z" fill="#120b07" stroke="#060504" strokeWidth="7" />
          <path d="M323 111 Q386 94 448 113 L457 246 Q388 265 311 246 Z" fill="url(#shade)" stroke="#5d3218" strokeWidth="2" />
          <path d="M335 115 L328 242 M349 111 L345 247 M364 108 L363 251 M381 106 L381 254 M398 106 L400 253 M416 108 L420 250 M432 111 L440 246" stroke="rgba(255,214,155,.18)" strokeWidth="2" />
          <ellipse cx="385" cy="250" rx="76" ry="14" fill="#5b3218" />
          <ellipse cx="385" cy="247" rx="71" ry="10" fill="#fff0bc" />
          <ellipse cx="385" cy="247" rx="54" ry="7" fill="#fffbe9" />
          <ellipse cx="385" cy="247" rx="44" ry="5" fill="#fff" />
          <ellipse cx="385" cy="247" rx="71" ry="10" fill="none" stroke="#ffcc66" strokeWidth="4" opacity={lampOn ? "0.4" : "0.7"} filter="url(#softGlow)" />
          <ellipse cx="385" cy="247" rx="105" ry="95" fill="url(#bulb)" opacity={lampOn ? "0.34" : "0"} filter="url(#glow)" />
          <ellipse cx="385" cy="247" rx="40" ry="28" fill="url(#bulb)" opacity={lampOn ? "0.8" : "0"} filter="url(#softGlow)" />
          <ellipse cx="154" cy="616" rx="130" ry="26" fill="#050403" />
          <path d="M34 607 Q154 574 274 607 L266 635 Q154 658 42 634 Z" fill="url(#base)" stroke="#0a0705" strokeWidth="4" />
          <ellipse cx="154" cy="605" rx="120" ry="22" fill="#1a0e08" />
          <ellipse cx="154" cy="601" rx="111" ry="17" fill="url(#metal)" opacity=".65" />
          <ellipse cx="154" cy="598" rx="83" ry="9" fill="rgba(255,173,75,.13)" />
          
          <g id="powerSwitch" role="button" tabIndex="0" filter="url(#switchShadow)" onClick={toggleLamp} className="cursor-pointer hover:drop-shadow-[0_0_5px_rgba(255,191,91,.25)] active:translate-y-[3px] transition-transform duration-100">
            <ellipse cx="170" cy="595" rx="13" ry="5" fill="#080604" />
            <ellipse cx="170" cy="595" rx="7" ry="5" fill="#24140a" stroke="#5a3117" strokeWidth="1" />
            <ellipse id="switchButton" cx="170" cy="595" rx="7" ry="5" fill="url(#switchMetal)" stroke="#6e3d18" strokeWidth="1" />
            <ellipse cx="170" cy="595" rx="2.2" ry="1.1" fill="rgba(255,220,150,.55)" />
          </g>
          <path d="M42 624 C12 623 -1 628 -28 641" fill="none" stroke="#080706" strokeWidth="10" strokeLinecap="round" />
          <path d="M42 622 C11 621 -3 627 -29 639" fill="none" stroke="#3b2414" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>

      {/* =========================================================
          LOGIN PANEL GLASSMORPHISM - RESPONSIF
          ========================================================= */}
      <div className={`absolute z-[15] top-[10%] lg:top-[8%] right-[5%] lg:right-[7%] w-[min(90vw,360px)] lg:w-[min(38vw,430px)] p-[24px] md:p-[30px] lg:p-[38px_40px_34px] rounded-[20px] transition-all duration-600 ${lampOn ? 'opacity-100 scale-100 visible pointer-events-auto' : 'opacity-0 scale-95 invisible pointer-events-none'}`}>
        
        {/* Background Glass + Shadow */}
        <div className="absolute inset-0 rounded-[20px] bg-gradient-to-br from-[rgba(35,24,16,.46)] to-[rgba(8,7,6,.30)] border border-[rgba(255,208,125,.28)] shadow-[0_25px_70px_rgba(0,0,0,.48),inset_0_1px_0_rgba(255,220,170,.10)] backdrop-blur-[5px] saturate-115" />
        
        <div className="relative z-10 text-center">
          <h1 className="text-[clamp(22px,2.3vw,34px)] font-bold tracking-[-.03em] text-[#fff8ec] drop-shadow-[0_2px_15px_rgba(0,0,0,.45)]">
            {isSignUp ? 'Buat Akun' : 'Welcome Back'}
          </h1>
          <p className="mt-2 mb-[24px] lg:mb-[34px] text-[14px] lg:text-[15px] text-[rgba(255,236,207,.68)]">
            {isSignUp ? 'Daftar untuk memulai ruang kerja Anda' : 'Masuk ke ruang kerja pribadi Anda'}
          </p>

          <form className="space-y-4 md:space-y-5 lg:space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block text-left text-[13px] text-[rgba(255,238,211,.86)]" htmlFor="email">Email</label>
              <div className="relative">
                <input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  className="w-full h-[50px] lg:h-[58px] pl-[16px] lg:pl-[18px] pr-[16px] lg:pr-[18px] rounded-[12px] outline-none border border-[rgba(255,214,145,.24)] text-[14px] lg:text-[15px] shadow-[inset_0_1px_5px_rgba(0,0,0,.25)] focus:border-[rgba(255,205,107,.68)] focus:shadow-[0_0_0_3px_rgba(255,190,70,.08),inset_0_1px_5px_rgba(0,0,0,.25)] transition-all" 
                  placeholder="nama@email.com"
                  style={{
                    backgroundColor: 'rgba(5,5,5,.25)',
                    color: '#fff5e6'
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-left text-[13px] text-[rgba(255,238,211,.86)]" htmlFor="password">Password</label>
                {!isSignUp && (
                  <a className="text-[13px] text-[#e4b84f] hover:text-[#ffe29a] transition-colors" href="#">Lupa kata sandi?</a>
                )}
              </div>
              <div className="relative">
                <input 
                  id="password" 
                  type={showPassword ? 'text' : 'password'} 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  className="w-full h-[50px] lg:h-[58px] pl-[16px] lg:pl-[18px] pr-[44px] lg:pr-[48px] rounded-[12px] outline-none border border-[rgba(255,214,145,.24)] text-[14px] lg:text-[15px] shadow-[inset_0_1px_5px_rgba(0,0,0,.25)] focus:border-[rgba(255,205,107,.68)] focus:shadow-[0_0_0_3px_rgba(255,190,70,.08),inset_0_1px_5px_rgba(0,0,0,.25)] transition-all" 
                  placeholder="••••••••"
                  style={{
                    backgroundColor: 'rgba(5,5,5,.25)',
                    color: '#fff5e6'
                  }}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-[14px] top-1/2 -translate-y-1/2 p-[6px] text-[rgba(255,235,205,.62)] hover:text-[#f4d18e] transition-colors"
                >
                  {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-500 rounded-lg text-red-400 text-sm text-left">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full h-[50px] lg:h-[58px] border-0 rounded-[11px] cursor-pointer text-[14px] lg:text-[15px] font-bold tracking-[.02em] text-[#1b1105] bg-gradient-to-br from-[#d9ad51] to-[#f0ca6d] shadow-[0_8px_22px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.30)] transition-all hover:brightness-110 hover:shadow-[0_10px_28px_rgba(0,0,0,.34),0_0_20px_rgba(239,190,83,.12)] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Memproses...</>
              ) : (
                isSignUp ? 'DAFTAR' : 'MASUK'
              )}
            </button>

            <div className="text-center mt-3 lg:mt-4">
              <p className="font-body-sm text-[13px] lg:text-sm text-[rgba(255,236,207,.68)]">
                {isSignUp ? 'Sudah punya akun? ' : 'Belum punya akun? '}
                <button 
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                    setPassword('');
                    setEmail('');
                  }}
                  className="text-[#e4b84f] hover:text-[#ffe29a] transition-colors underline"
                >
                  {isSignUp ? 'Masuk' : 'Daftar'}
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* FINAL VIGNETTE */}
      <div className="absolute inset-0 z-[20] pointer-events-none bg-[radial-gradient(ellipse_82%_82%_at_47%_47%,transparent_40%,rgba(0,0,0,.08)_65%,rgba(0,0,0,.40)_100%)]" />
    </div>
  );
}