const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * Mesin Eksekusi Web3 Airdrop Farmer
 * Berjalan di Desktop user menggunakan Chromium terselubung (Stealth)
 */
async function runAirdropTask(taskName, params = {}) {
  let browser;
  try {
    console.log(`[AirdropEngine] Memulai task: ${taskName}`);
    
    // Kita jalankan headless: false (tampil di layar) agar user bisa melihat prosesnya
    // dan bisa interaksi manual dengan MetaMask jika diperlukan (first time login).
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    
    // Contoh Logika Dasar (Nanti bisa dipisah berdasarkan taskName)
    if (taskName === 'test_stealth') {
      await page.goto('https://bot.sannysoft.com');
      await new Promise(resolve => setTimeout(resolve, 5000));
      // Ambil screenshot sebagai bukti stealth berhasil
      // await page.screenshot({ path: 'stealth-test.png', fullPage: true });
    } else {
      await page.goto('https://google.com');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`[AirdropEngine] Task ${taskName} selesai.`);
    await browser.close();
    return { success: true, message: `Task ${taskName} berhasil diselesaikan oleh Stealth Browser.` };

  } catch (error) {
    console.error(`[AirdropEngine] Error:`, error);
    if (browser) await browser.close();
    return { success: false, message: `Gagal menjalankan stealth browser: ${error.message}` };
  }
}

module.exports = { runAirdropTask };
