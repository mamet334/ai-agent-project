const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
puppeteer.use(
  RecaptchaPlugin({
    provider: { id: '2captcha', token: process.env.CAPTCHA_API_KEY || 'dummy_key' },
    visualFeedback: true // mewarnai kotak captcha yang sedang di-solve
  })
);

const path = require('path');
const { app } = require('electron');
const { createCursor } = require('ghost-cursor');

/**
 * Helper untuk otomatis mencari dan mengeklik tombol di dalam popup MetaMask
 * Sangat tahan banting terhadap perubahan UI MetaMask.
 */
async function autoMetamaskSign(browser) {
  console.log('[MetamaskHelper] Menunggu popup Metamask...');
  await new Promise(r => setTimeout(r, 3000)); // Beri waktu animasi popup

  const pages = await browser.pages();
  // Cari tab yang merupakan ekstensi (notification/popup)
  const metamaskPage = pages.find(p => p.url().includes('chrome-extension://') && p.url().includes('notification'));

  if (!metamaskPage) {
    console.log('[MetamaskHelper] Tidak ada popup MetaMask aktif.');
    return false;
  }

  console.log('[MetamaskHelper] Popup MetaMask terdeteksi! Mengambil alih...');
  await metamaskPage.bringToFront();

  try {
    // Cari dan klik tombol biru utama (Next, Connect, Sign, Confirm, Approve)
    const clicked = await metamaskPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const targetKeywords = ['Next', 'Connect', 'Sign', 'Confirm', 'Approve'];

      for (const btn of buttons) {
        if (!btn.disabled && targetKeywords.some(keyword => btn.innerText.includes(keyword))) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      console.log('[MetamaskHelper] ✅ Berhasil mengeklik tombol persetujuan!');
      return true;
    } else {
      console.log('[MetamaskHelper] ⚠️ Tombol persetujuan tidak ditemukan/belum aktif.');
      return false;
    }
  } catch (err) {
    console.error('[MetamaskHelper] Error klik MetaMask:', err.message);
    return false;
  }
}

/**
 * Helper untuk menyetujui Login Twitter & Discord serta Task Intent secara otomatis
 */
async function autoSocialSign(browser) {
  console.log('[SocialHelper] Menunggu popup otorisasi atau aksi (Twitter/Discord)...');
  await new Promise(r => setTimeout(r, 4000));

  const pages = await browser.pages();
  const socialPage = pages.find(p =>
    p.url().includes('twitter.com/i/oauth') ||
    p.url().includes('api.twitter.com/oauth') ||
    p.url().includes('discord.com/oauth2/authorize') ||
    p.url().includes('x.com/intent/') ||
    p.url().includes('twitter.com/intent/')
  );

  if (!socialPage) {
    console.log('[SocialHelper] Tidak ada popup Twitter/Discord aktif.');
    return false;
  }

  console.log('[SocialHelper] Popup Sosial terdeteksi! Mengambil alih...');
  await socialPage.bringToFront();
  await new Promise(r => setTimeout(r, 2000)); // Tunggu elemen selesai di-render

  try {
    const clicked = await socialPage.evaluate(() => {
      // Tombol otorisasi bisa berupa button atau div dengan role="button"
      const allElements = Array.from(document.querySelectorAll('div[role="button"], button, span'));
      const targetKeywords = ['Authorize app', 'Authorize', 'Izinkan aplikasi', 'Setujui', 'Otorisasi', 'Follow', 'Post', 'Reply', 'Like'];

      for (const el of allElements) {
        // Cek apakah elemen terlihat dan memiliki teks yang cocok
        const text = el.innerText || '';
        if (targetKeywords.some(keyword => text.trim() === keyword || text.includes(keyword)) && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      console.log('[SocialHelper] ✅ Berhasil mengeklik otorisasi/aksi sosial!');
      await new Promise(r => setTimeout(r, 3000)); // Tunggu proses selesai
      await socialPage.close(); // Tutup tab intent jika berhasil
      return true;
    } else {
      console.log('[SocialHelper] ⚠️ Tombol otorisasi/aksi tidak ditemukan.');
      return false;
    }
  } catch (err) {
    console.error('[SocialHelper] Error klik Sosial:', err.message);
    return false;
  }
}

/**
 * Mesin Eksekusi Web3 Airdrop Farmer (Phase 5: Monetization Empire)
 * Berjalan di Desktop user menggunakan Chromium terselubung (Stealth)
 */
async function runAirdropTask(taskName, params = {}) {
  let browser;
  try {
    console.log(`[AirdropEngine] Memulai task: ${taskName} dengan proxy: ${params.proxy || 'None'}`);

    // Gunakan userDataDir agar sesi (Login Twitter, Discord, Metamask) TERSIMPAN PERMANEN
    const userDataPath = path.join(app.getPath('userData'), 'StealthSession');
    console.log(`[AirdropEngine] Menggunakan profil tersimpan di: ${userDataPath}`);

    // Cari path instalasi Google Chrome asli di komputer User
    // Ini jauh lebih 'stealth' daripada menggunakan Chromium bawaan Puppeteer
    const fs = require('fs');
    let execPath = '';
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        execPath = p;
        break;
      }
    }

    // Fallback jika Chrome tidak ketemu
    if (!execPath) {
      const defaultPath = puppeteer.executablePath();
      execPath = typeof defaultPath === 'string' ? defaultPath : '';
    }

    console.log(`[AirdropEngine] Executable Path yang akan digunakan: ${execPath}`);

    // Siapkan argumen browser (termasuk injeksi Proxy jika ada)
    const browserArgs = [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ];
    if (params.proxy) {
      browserArgs.push(`--proxy-server=${params.proxy}`);
    }

    browser = await puppeteer.launch({
      headless: false, // Wajib false untuk Metamask dan bypass captcha yang rumit
      executablePath: String(execPath), // PASTIKAN SELALU STRING
      defaultViewport: null,
      userDataDir: userDataPath,
      args: browserArgs,
      ignoreDefaultArgs: ['--enable-automation'] // Menghapus tulisan "Chrome is being controlled by automated test software"
    });

    const page = await browser.newPage();

    // ==========================================
    // 1. TOPENG ROTASI: Autentikasi Proxy
    // ==========================================
    if (params.proxyUsername && params.proxyPassword) {
      await page.authenticate({
        username: params.proxyUsername,
        password: params.proxyPassword,
      });
      console.log('[AirdropEngine] Proxy authentication diaktifkan.');
    }

    // ==========================================
    // LOGIKA TASK RUNNER
    // ==========================================
    if (taskName === 'test_stealth') {
      await page.goto('https://bot.sannysoft.com', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    else if (taskName === 'faucet_claim') {
      // ==========================================
      // 2 & 3. METAMASK INTERACTION & CAPTCHA SOLVER (Contoh Faucet)
      // ==========================================
      const faucetUrl = params.faucetUrl || 'https://sepoliafaucet.com/';
      await page.goto(faucetUrl, { waitUntil: 'networkidle2' });

      console.log('[AirdropEngine] Mencari dan memecahkan reCAPTCHA/hCaptcha jika ada...');
      // Memanggil plugin solver otomatis
      const { captchas, filtered, solutions, solved, error } = await page.solveRecaptchas();
      if (solved && solved.length > 0) {
        console.log('[AirdropEngine] 🔓 Captcha berhasil dipecahkan otomatis!');
      }

      // TODO: Logika klik tombol connect wallet Metamask (Popup Handler)
      // await page.click('#connect-wallet-btn');
      // // Switch window ke popup Metamask
      // // click next, connect, sign...

      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    else if (taskName === 'galxe_campaign') {
      // ==========================================
      // SIMULASI: FARMING AIRDROP DI GALXE
      // ==========================================
      const targetUrl = params.url || 'https://app.galxe.com/';
      console.log(`[AirdropEngine] Membuka kampanye Galxe: ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'networkidle2' });

      // 1. Bypass Captcha (Cloudflare/Turnstile) di awal halaman jika ada
      console.log('[AirdropEngine] Memeriksa Captcha / Anti-Bot Security...');
      const captchaResult = await page.solveRecaptchas();
      if (captchaResult.solved && captchaResult.solved.length > 0) {
        console.log('[AirdropEngine] 🔓 Captcha rintangan awal berhasil dipecahkan!');
      }

      // 2. Klik Connect Wallet / Log In
      console.log('[AirdropEngine] Mencari tombol Connect Wallet / Log in...');
      const cursor = createCursor(page);

      try {
        // Cari koordinat tombol secara presisi
        const btnBox = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a'));
          for (let el of els) {
            const txt = (el.innerText || '').toLowerCase().trim();
            if ((txt === 'log in' || txt === 'login' || txt === 'connect wallet') && el.offsetParent !== null) {
              const rect = el.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
          return null;
        });

        if (btnBox) {
          console.log('[AirdropEngine] Menggerakkan kursor hantu ke tombol Login...');
          await cursor.moveTo(btnBox);
          await new Promise(r => setTimeout(r, 500));
          await page.mouse.click(btnBox.x, btnBox.y);
          console.log('[AirdropEngine] Tombol Login diklik secara fisik, menunggu popup pilihan dompet...');
        } else {
          console.log('[AirdropEngine] Tombol Login tidak ditemukan. Asumsi Anda sudah login!');
          console.log('[AirdropEngine] Menunggu 6 detik agar Galxe memuat daftar tugas (GraphQL)...');
          await new Promise(r => setTimeout(r, 6000));
        }

        await new Promise(r => setTimeout(r, 4000)); // Tunggu modal pilihan wallet muncul

        // Klik opsi Metamask dengan Ghost Cursor
        console.log('[AirdropEngine] Mencari opsi dompet MetaMask...');
        const metaBox = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('div, button, span'));
          for (let el of els) {
            const txt = (el.innerText || '').toLowerCase();
            if (txt.includes('metamask') && el.offsetParent !== null) {
              const rect = el.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
          return null;
        });

        if (metaBox) {
          await cursor.moveTo(metaBox);
          await new Promise(r => setTimeout(r, 500));
          await page.mouse.click(metaBox.x, metaBox.y);
          console.log('[AirdropEngine] Logo MetaMask berhasil diklik!');
        }

        await new Promise(r => setTimeout(r, 3000)); // Tunggu Metamask memicu popup
      } catch (e) {
        console.log('[AirdropEngine] Gagal memproses tahapan Login:', e.message);
      }

      // 3. Tangani Popup Metamask (Connect / Sign Message)
      await autoMetamaskSign(browser);

      // 4. Mengerjakan Tugas Sosial (Twitter / Discord) & Claim
      console.log('[AirdropEngine] Memindai elemen tugas secara brutal (Bypass Anti-Bot UI)...');
      try {
        const cursor = createCursor(page);

        // Loop pemindaian beberapa kali (Multi-Pass) untuk tombol yang baru terbuka (seperti Participate/Claim)
        for (let pass = 1; pass <= 3; pass++) {
          console.log(`[AirdropEngine] --- Memulai Pemindaian Pass ke-${pass} ---`);

          const clickTargets = await page.evaluate(() => {
            const targets = [];
            const allElements = document.querySelectorAll('div, button, a, span');

            for (let el of allElements) {
              const text = (el.innerText || '').toLowerCase().trim();
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();

              // 1. Deteksi via Kata Kunci (Dipebanyak)
              const isTaskKeyword = text.includes('verify') || text.includes('follow') || text.includes('join') || text.includes('claim') || text.includes('start') || text.includes('retweet') || text.includes('quote') || text.includes('participate') || text.includes('visit') || text.includes('like') || text.includes('repost') || text.includes('watch') || text.includes('read') || text.includes('space');

              // 2. Deteksi via Geometri Ruang (Cara Otomatis Tanpa Baca Teks)
              // Baris tugas Galxe biasanya berupa kotak panjang (lebar > 300px, tinggi 40-120px) yang berada di tengah/bawah layar (y > 200)
              const isTaskShape = (el.tagName === 'DIV') && (rect.width > 250 && rect.height >= 40 && rect.height <= 150 && rect.y > 150);

              const isClickable = style.cursor === 'pointer' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
              const isVisible = el.offsetParent !== null;

              // Hindari mengeklik tombol header navigasi atau logo (batas y > 100)
              if ((isTaskKeyword || isTaskShape) && isClickable && isVisible && rect.y > 100 && el.children.length < 15) {
                if (rect.width > 0 && rect.height > 0) {
                  targets.push({
                    x: rect.x + rect.width / 2,
                    y: rect.y + rect.height / 2,
                    text: text.replace(/\n/g, ' ').substring(0, 30) || 'Task_Box_Geometris'
                  });
                }
              }
            }
            return targets;
          });

          if (clickTargets.length === 0) {
            console.log('[AirdropEngine] Tidak ada tugas baru yang ditemukan di pass ini.');
          } else {
            console.log(`[AirdropEngine] Ditemukan ${clickTargets.length} target klik potensial!`);
            for (const target of clickTargets) {
              console.log(`[AirdropEngine] 🎯 Mengeklik target: "${target.text}..."`);
              await cursor.moveTo(target);
              await new Promise(r => setTimeout(r, 600));
              await page.mouse.click(target.x, target.y);
              await new Promise(r => setTimeout(r, Math.floor(Math.random() * 3000) + 3000));
            }
          }

          // 5. Tangani Otorisasi Twitter/Discord jika popup muncul akibat klik tadi
          await autoSocialSign(browser);

          // Tunggu sebentar sebelum Pass berikutnya (memberi waktu Galxe memverifikasi/membuka tombol baru)
          await new Promise(r => setTimeout(r, 4000));
        }

      } catch (e) {
        console.log('[AirdropEngine] Gagal memicu task sosial/claim:', e.message);
      }

      console.log('[AirdropEngine] Skrip Galxe Campaign selesai dieksekusi.');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    else {
      await page.goto('https://google.com');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`[AirdropEngine] Task ${taskName} selesai.`);
    // Jangan langsung tutup browser jika mode testing/pengembangan
    if (!params.keepOpen) {
      await browser.close();
    }

    return { success: true, message: `Task ${taskName} berhasil diselesaikan oleh Stealth Browser.` };

  } catch (error) {
    console.error(`[AirdropEngine] Error:`, error);
    if (browser) await browser.close();
    return { success: false, message: `Gagal menjalankan stealth browser: ${error.message}` };
  }
}

module.exports = { runAirdropTask };
