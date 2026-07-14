const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require(path.join(__dirname, '../frontend/node_modules/puppeteer'));
const fs = require('fs');
const http = require('http');

const PORT = 9222;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const logFile = path.join(__dirname, 'ui_audit_log.txt');
fs.writeFileSync(logFile, "=== UI Audit Log ===\n\n");

function writeLog(msg) {
  console.log(msg);
  fs.appendFileSync(logFile, msg + "\n");
}

(async () => {
  writeLog("[System] Starting Electron application...");

  const electronProcess = spawn('npx.cmd', ['electron', '.', `--remote-debugging-port=${PORT}`], {
    cwd: FRONTEND_DIR,
    shell: true
  });

  let bootComplete = false;

  electronProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Kernel Boot Complete. Mounting UI')) {
      bootComplete = true;
    }
  });

  electronProcess.stderr.on('data', (data) => {
    fs.appendFileSync(logFile, `[Electron STDERR] ${data.toString()}`);
  });

  // Wait for boot
  writeLog("[System] Waiting for Kernel boot...");
  for (let i = 0; i < 60; i++) {
    if (bootComplete) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!bootComplete) {
    writeLog("[Error] Boot timeout or failed to detect boot completion.");
  } else {
    writeLog("[System] Boot complete detected. Connecting Puppeteer...");
  }

  // Wait a little extra for UI to settle
  await new Promise(r => setTimeout(r, 3000));

  let browser;
  try {
    // We must use puppeteer to connect to the running browser
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: null
    });

    const pages = await browser.pages();
    // Electron's main window is usually the first or second page. Let's find one with 'mamet' or 'index.html'.
    const page = pages.find(p => p.url().includes('index.html') || p.url().includes('mamet://')) || pages[0];

    writeLog(`[System] Connected to page: ${page.url()}`);

    page.on('console', msg => {
      writeLog(`[Page Console] [${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    
    page.on('pageerror', err => {
      writeLog(`[Page Error] ${err.toString()}`);
    });

    // Wait for the UI to fully render
    await new Promise(r => setTimeout(r, 2000));

    // Screenshot 1: Home
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_initial_home.png') });
    writeLog("[Action] Saved 01_initial_home.png");

    // Click "Engineer" menu
    writeLog("[Action] Attempting to click Engineer menu...");
    await page.waitForFunction(() => {
      const els = Array.from(document.querySelectorAll('button, a, [role="button"], span'));
      return els.some(b => b.textContent && b.textContent.includes('Engineer'));
    }, { timeout: 10000 });

    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, [role="button"], span'));
      const engButton = elements.find(b => b.textContent && b.textContent.includes('Engineer'));
      if (engButton) {
        const clickable = engButton.closest('button, a, div[role="button"], li') || engButton;
        clickable.click();
      } else {
        console.error("Could not find Engineer menu button after wait");
      }
    });

    // Wait for Engineer layout to load
    await new Promise(r => setTimeout(r, 4000));
    
    // Measure Grid layout to verify 1fr 1.5fr 1fr
    const gridMetrics = await page.evaluate(() => {
      const mainGrid = document.querySelector('.grid.overflow-hidden');
      if (!mainGrid) return "No .grid.overflow-hidden found!";
      const rect = mainGrid.getBoundingClientRect();
      const children = Array.from(mainGrid.children).map(c => {
         const r = c.getBoundingClientRect();
         return { width: r.width, height: r.height, tag: c.tagName, classes: c.className };
      });
      return { container: { width: rect.width, height: rect.height }, children };
    });
    
    writeLog(`[Metrics] Engineer Grid Layout Dimensions: ${JSON.stringify(gridMetrics, null, 2)}`);

    // Measure widgets overlap
    const widgetsOverlap = await page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll('.flex-1.overflow-y-auto > div')); // This selects SortableWidgetWrappers roughly
      let overlapped = false;
      for(let i=0; i<widgets.length; i++) {
        for(let j=i+1; j<widgets.length; j++) {
           const r1 = widgets[i].getBoundingClientRect();
           const r2 = widgets[j].getBoundingClientRect();
           // Check vertical intersection
           if (!(r2.left >= r1.right || r2.right <= r1.left || r2.top >= r1.bottom || r2.bottom <= r1.top)) {
              // They overlap!
              // Sometimes margin collapses or shadow overlaps. Let's consider significant overlap
              overlapped = true;
           }
        }
      }
      return overlapped ? "OVERLAP_DETECTED" : "NO_OVERLAP";
    });
    writeLog(`[Metrics] Widget Overlap Status: ${widgetsOverlap}`);

    // Screenshot 2: Engineer Workspace
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_engineer_workspace.png') });
    writeLog("[Action] Saved 02_engineer_workspace.png");

    // Click "Home" menu
    writeLog("[Action] Attempting to click Home menu...");
    await page.waitForFunction(() => {
      const els = Array.from(document.querySelectorAll('button, a, [role="button"], span'));
      return els.some(b => b.textContent && b.textContent.includes('Home'));
    }, { timeout: 10000 });

    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, [role="button"], span'));
      const homeButton = elements.find(b => b.textContent && b.textContent.includes('Home'));
      if (homeButton) {
        const clickable = homeButton.closest('button, a, div[role="button"], li') || homeButton;
        clickable.click();
      } else {
        console.error("Could not find Home menu button after wait");
      }
    });

    await new Promise(r => setTimeout(r, 2000));
    
    // Screenshot 3: Home
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_back_to_home.png') });
    writeLog("[Action] Saved 03_back_to_home.png");

  } catch (err) {
    writeLog(`[System Error] ${err.message}`);
  } finally {
    if (browser) await browser.disconnect();
    electronProcess.kill();
    writeLog("[System] Test finished and Electron process killed.");
    process.exit(0);
  }
})();
