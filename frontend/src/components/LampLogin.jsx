import React, { useState } from 'react';
import { supabase } from '../supabase';
import { AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

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
          LAYER 0: BACKDROP PENUH LAYAR — mengisi SELURUH viewport,
          tidak dibatasi aspect-ratio, sehingga tidak ada lagi
          gap/letterbox hitam di atas-bawah pada layar HP.
          ========================================================= */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_72%_at_39%_56%,rgba(119,70,35,.68)_0%,rgba(78,43,23,.48)_32%,rgba(42,24,15,.72)_64%,#0b0705_100%),linear-gradient(180deg,#21140c,#3a2113_50%,#17100b)]" />
      <div 
        className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px'
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/43 via-transparent via-78% to-black/52" />

      {/* =========================================================
          SCENE CONTAINER — mengisi penuh viewport (bukan lagi
          dipaksa 16:9), supaya tidak ada gap hitam kosong di
          layar HP yang rasionya jauh lebih tinggi/sempit.
          Elemen di dalamnya tetap diposisikan pakai % relatif
          terhadap container ini, jadi tetap proporsional dan
          tidak akan terpotong di layar mana pun.
          ========================================================= */}
      <div className="relative w-full h-full">
        {/* =========================================================
            ✨ HANGING LAMP — rantai + kabel dari atas layar,
            menggantung di area tengah-kiri. Ukuran membesar di
            layar sempit (HP) dan mengecil di layar lebar (laptop),
            agar tetap jadi focal point yang jelas di kedua kondisi.
            ========================================================= */}
        <div
          className="absolute left-1/2 top-0 z-[11] -translate-x-1/2"
          style={{
            width: 'clamp(140px, min(34vw, 42vh), 260px)',
          }}
        >
          <svg viewBox="0 0 300 420" className="w-full h-auto overflow-visible">
            <defs>
              <linearGradient id="chainMetal" x1="0" x2="1">
                <stop offset="0" stopColor="#2a1a0d" />
                <stop offset=".5" stopColor="#8a5a28" />
                <stop offset="1" stopColor="#2a1a0d" />
              </linearGradient>
              <linearGradient id="shadeHang" x1="0" x2="1">
                <stop offset="0" stopColor="#6a3919" />
                <stop offset=".20" stopColor="#a95f28" />
                <stop offset=".47" stopColor="#d88b42" />
                <stop offset=".75" stopColor="#9a5423" />
                <stop offset="1" stopColor="#4d2915" />
              </linearGradient>
              <radialGradient id="bulbHang">
                <stop offset="0" stopColor="#fffde8" />
                <stop offset=".25" stopColor="#fff3b7" />
                <stop offset=".7" stopColor="#ffc65c" />
                <stop offset="1" stopColor="#d97720" stopOpacity="0" />
              </radialGradient>
              <filter id="glowHang"><feGaussianBlur stdDeviation="11" /></filter>
              <filter id="softGlowHang"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>

            {/* Rantai penggantung */}
            {Array.from({ length: 9 }).map((_, i) => (
              <ellipse
                key={i}
                cx={150 + (i % 2 === 0 ? -4 : 4)}
                cy={10 + i * 16}
                rx="7"
                ry="9"
                fill="none"
                stroke="url(#chainMetal)"
                strokeWidth="3.5"
              />
            ))}
            {/* Kabel listrik melilit rantai */}
            <path
              d="M150 8 C165 30 135 52 150 74 C165 96 135 118 150 140"
              fill="none"
              stroke="#0d0a08"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Dudukan atas kap lampu */}
            <rect x="136" y="140" width="28" height="18" rx="5" fill="#24150b" />
            <rect x="141" y="143" width="18" height="14" rx="4" fill="url(#chainMetal)" />

            {/* Kap lampu (kepala lampu, desain sama seperti versi meja) */}
            <path d="M82 158 Q150 138 218 158 L232 300 Q150 324 68 300 Z" fill="#120b07" stroke="#060504" strokeWidth="7" />
            <path d="M88 164 Q150 146 212 164 L221 292 Q151 312 79 292 Z" fill="url(#shadeHang)" stroke="#5d3218" strokeWidth="2" />
            <path d="M100 168 L93 288 M114 164 L110 293 M129 161 L128 297 M146 159 L146 300 M163 159 L165 300 M181 161 L185 297 M197 164 L205 293" stroke="rgba(255,214,155,.18)" strokeWidth="2" />

            {/* Bohlam & cahaya */}
            <ellipse cx="150" cy="302" rx="76" ry="14" fill="#5b3218" />
            <ellipse cx="150" cy="299" rx="71" ry="10" fill="#fff0bc" />
            <ellipse cx="150" cy="299" rx="54" ry="7" fill="#fffbe9" />
            <ellipse cx="150" cy="299" rx="44" ry="5" fill="#fff" />
            <ellipse cx="150" cy="299" rx="71" ry="10" fill="none" stroke="#ffcc66" strokeWidth="4" opacity={lampOn ? "0.4" : "0.7"} filter="url(#softGlowHang)" />
            <ellipse cx="150" cy="310" rx="130" ry="115" fill="url(#bulbHang)" opacity={lampOn ? "0.4" : "0"} filter="url(#glowHang)" />
            <ellipse cx="150" cy="299" rx="40" ry="28" fill="url(#bulbHang)" opacity={lampOn ? "0.85" : "0"} filter="url(#softGlowHang)" />
          </svg>
        </div>

        {/* =========================================================
            ✨ BRANDING + SAKELAR — dibungkus satu flex-column agar
            sakelar SELALU jatuh tepat di bawah teks apa pun tinggi
            teks yang sebenarnya dirender (tidak lagi pakai top-%
            terpisah yang bisa menyebabkan tumpang tindih).
            ========================================================= */}
        <div
          className="absolute left-[6%] top-[40%] flex flex-col items-start gap-[3%] pointer-events-none z-10 select-none"
        >
          <div className="flex flex-col items-start">
            {['MAMET', 'OS', 'ECOSYSTEM'].map((line) => (
              <span
                key={line}
                className="text-[#fff8ec] tracking-[0.15em] uppercase font-mono font-light leading-[1.25] text-left"
                style={{
                  fontSize: 'clamp(20px, 4vw, 46px)',
                  textShadow: `
                    0 0 10px rgba(255, 220, 150, 0.6),
                    0 0 20px rgba(255, 220, 150, 0.4),
                    0 0 40px rgba(255, 200, 100, 0.2),
                    0 0 80px rgba(255, 180, 80, 0.1)
                  `
                }}
              >
                {line}
              </span>
            ))}
          </div>

          {/* Sakelar — sekarang bagian dari flex yang sama,
              otomatis menempel di bawah teks tanpa tabrakan */}
          <div
            className="pointer-events-auto"
            style={{ width: 'clamp(34px, 4.5vw, 52px)' }}
          >
            <svg
              viewBox="0 0 60 60"
              className="w-full h-full overflow-visible cursor-pointer"
              role="button"
              tabIndex="0"
              aria-label="Nyalakan atau matikan lampu"
              onClick={toggleLamp}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLamp(); } }}
            >
              <defs>
                <radialGradient id="wallPlate">
                  <stop offset="0" stopColor="#241608" />
                  <stop offset="1" stopColor="#0e0906" />
                </radialGradient>
                <radialGradient id="switchMetalWall">
                  <stop offset="0" stopColor="#dca35b" />
                  <stop offset=".35" stopColor="#8a4d1c" />
                  <stop offset=".72" stopColor="#2b170c" />
                  <stop offset="1" stopColor="#070605" />
                </radialGradient>
              </defs>
              {/* Plat dinding sakelar */}
              <rect x="4" y="4" width="52" height="52" rx="10" fill="url(#wallPlate)" stroke="#3a2412" strokeWidth="1.5" />
              {/* Hit-area lebih besar dari tombol visual */}
              <circle cx="30" cy="30" r="26" fill="transparent" />
              {/* Tombol bulat */}
              <circle cx="30" cy="30" r="14" fill="#080604" />
              <circle cx="30" cy="30" r="11" fill="url(#switchMetalWall)" stroke="#6e3d18" strokeWidth="1" className="transition-transform active:translate-y-[1px]" />
              <ellipse cx="27" cy="26" rx="3.5" ry="2" fill="rgba(255,220,150,.55)" />
              {lampOn && (
                <circle cx="30" cy="30" r="14" fill="none" stroke="#ffcc66" strokeWidth="1.5" opacity="0.6" filter="url(#softGlowHang)" />
              )}
            </svg>
          </div>
        </div>

        {/* =========================================================
            LIGHT FIELD (Pantulan Cahaya) — sekarang berpusat dari
            lampu gantung, menjangkau ke bawah (teks & sakelar) dan
            melebar ke kanan menuju area panel login.
            ========================================================= */}
        <div className={`absolute left-0 top-0 w-full h-[75%] pointer-events-none z-[2] transition-all duration-900 ${lampOn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="absolute left-[2%] top-[8%] w-[85%] h-[65%] bg-[radial-gradient(ellipse_at_45%_30%,rgba(255,191,88,.28)_0%,rgba(231,143,52,.16)_28%,rgba(190,100,31,.06)_52%,transparent_75%)] blur-[30px]" />
          <div className="absolute left-[4%] top-[20%] w-[80%] h-[55%] bg-[radial-gradient(ellipse_at_48%_20%,rgba(255,188,82,.22),rgba(215,119,37,.08)_46%,transparent_76%)] blur-[20px]" />
        </div>

        {/* =========================================================
            DESK & HORIZON — strip tipis dekoratif di bagian paling
            bawah layar, bukan lagi pembatas besar yang memotong scene.
            ========================================================= */}
        <div className="absolute inset-x-0 bottom-[10%] h-[7%] bg-[radial-gradient(ellipse_42%_70%_at_32%_0%,rgba(202,126,58,.27),transparent_72%),linear-gradient(180deg,#63391d,#3b2112_15%,#1a0e08_55%,#080605)] shadow-[inset_0_5px_13px_rgba(255,184,91,.08),inset_0_-20px_35px_rgba(0,0,0,.46)] transition-all duration-900" />
        <div className="absolute inset-x-0 bottom-[17%] h-[0.3%] z-[6] bg-[#0d0805] shadow-[0_-1px_3px_rgba(255,178,86,.09),0_3px_14px_#000]" />

        {/* =========================================================
            KAKI MEJA — mengisi sisa ruang di bawah permukaan meja,
            dengan sela-sela gelap antar kaki agar terlihat natural.
            ========================================================= */}
        <div className="absolute inset-x-0 bottom-0 h-[10%] bg-[#050403]" />
        <div className="absolute inset-x-[10%] bottom-0 h-[10%] flex justify-between pointer-events-none">
          <div
            className="w-[8%] h-full bg-gradient-to-b from-[#3b2112] via-[#1a0e08] to-[#050302] shadow-[inset_2px_0_4px_rgba(255,184,91,.08),inset_-2px_0_6px_rgba(0,0,0,.6)]"
          />
          <div
            className="w-[8%] h-full bg-gradient-to-b from-[#3b2112] via-[#1a0e08] to-[#050302] shadow-[inset_2px_0_4px_rgba(255,184,91,.08),inset_-2px_0_6px_rgba(0,0,0,.6)]"
          />
        </div>


        {/* =========================================================
            LOGIN PANEL — GAYA "POSTER MENEMPEL DI DINDING"
            Frame tipis + shadow yang menyarankan panel ini menempel
            rata di permukaan dinding (bukan melayang), transparan
            sehingga cahaya lampu & teks di baliknya tetap terlihat.
            ========================================================= */}
        <div
          className={`absolute z-[15] right-[5%] w-[38%] min-w-[240px] max-w-[430px] p-[5%] rounded-[0.6vw] transition-all duration-600 ${lampOn ? 'opacity-100 scale-100 visible pointer-events-auto' : 'opacity-0 scale-95 invisible pointer-events-none'}`}
          style={{ top: 'max(18%, 140px)' }}
        >

          {/* Background Glass + Shadow — flat poster-on-wall look:
              tepi lebih tegas, shadow lebih dekat ke tepi (bukan
              shadow besar mengambang), kesan menempel rata */}
          <div className="absolute inset-0 rounded-[0.6vw] bg-gradient-to-br from-[rgba(35,24,16,.52)] to-[rgba(8,7,6,.38)] border-[1.5px] border-[rgba(255,208,125,.32)] shadow-[0_4px_18px_rgba(0,0,0,.55),0_1px_0_rgba(255,220,170,.10)_inset] backdrop-blur-[3px] saturate-115" />
          {/* Aksen "paku poster" di keempat sudut */}
          <div className="absolute top-[3%] left-[3%] w-[6px] h-[6px] rounded-full bg-[rgba(255,208,125,.35)] shadow-[0_1px_2px_rgba(0,0,0,.6)]" />
          <div className="absolute top-[3%] right-[3%] w-[6px] h-[6px] rounded-full bg-[rgba(255,208,125,.35)] shadow-[0_1px_2px_rgba(0,0,0,.6)]" />

          <div className="relative z-10 text-center">
            <h1 className="font-bold tracking-[-.03em] text-[#fff8ec] drop-shadow-[0_2px_15px_rgba(0,0,0,.45)]" style={{ fontSize: 'clamp(18px, 1.8vw, 30px)' }}>
              {isSignUp ? 'Buat Akun' : 'Welcome Back'}
            </h1>
            <p className="mt-2 mb-[8%] text-[rgba(255,236,207,.68)]" style={{ fontSize: 'clamp(12px, 1vw, 15px)' }}>
              {isSignUp ? 'Daftar untuk memulai ruang kerja Anda' : 'Masuk ke ruang kerja pribadi Anda'}
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="block text-left text-[13px] text-[rgba(255,238,211,.86)]" htmlFor="email">Email</label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-[48px] px-[16px] rounded-[12px] outline-none border border-[rgba(255,214,145,.24)] text-[14px] shadow-[inset_0_1px_5px_rgba(0,0,0,.25)] focus:border-[rgba(255,205,107,.68)] focus:shadow-[0_0_0_3px_rgba(255,190,70,.08),inset_0_1px_5px_rgba(0,0,0,.25)] transition-all"
                    placeholder="nama@email.com"
                    style={{ backgroundColor: 'rgba(5,5,5,.25)', color: '#fff5e6' }}
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
                    className="w-full h-[48px] pl-[16px] pr-[44px] rounded-[12px] outline-none border border-[rgba(255,214,145,.24)] text-[14px] shadow-[inset_0_1px_5px_rgba(0,0,0,.25)] focus:border-[rgba(255,205,107,.68)] focus:shadow-[0_0_0_3px_rgba(255,190,70,.08),inset_0_1px_5px_rgba(0,0,0,.25)] transition-all"
                    placeholder="••••••••"
                    style={{ backgroundColor: 'rgba(5,5,5,.25)', color: '#fff5e6' }}
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
                className="w-full h-[48px] border-0 rounded-[11px] cursor-pointer text-[14px] font-bold tracking-[.02em] text-[#1b1105] bg-gradient-to-br from-[#d9ad51] to-[#f0ca6d] shadow-[0_8px_22px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.30)] transition-all hover:brightness-110 hover:shadow-[0_10px_28px_rgba(0,0,0,.34),0_0_20px_rgba(239,190,83,.12)] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Memproses...</>
                ) : (
                  isSignUp ? 'DAFTAR' : 'MASUK'
                )}
              </button>

              <div className="text-center mt-3">
                <p className="text-[13px] text-[rgba(255,236,207,.68)]">
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
      </div>

      {/* FINAL VIGNETTE — di atas semua layer, mencakup seluruh layar */}
      <div className="absolute inset-0 z-[20] pointer-events-none bg-[radial-gradient(ellipse_82%_82%_at_47%_47%,transparent_40%,rgba(0,0,0,.08)_65%,rgba(0,0,0,.40)_100%)]" />
    </div>
  );
}
