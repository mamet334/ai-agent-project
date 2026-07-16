/**
 * fileProcessor.js
 *
 * Helper untuk memproses file yang dilampirkan user (image, ZIP, Excel, text biasa).
 * Diekstrak dari AIAgent.jsx :: handleSendMessage (baris 95-197).
 *
 * DEBUG POINTS:
 *   - processImage: cek canvas resize jika gambar terdistorsi
 *   - processZip: cek JSZip import jika ZIP gagal dibuka
 *   - processExcel: cek XLSX import jika file .xlsx tidak terbaca
 *   - processGenericFile: cek FileReader untuk file teks biasa
 */

/**
 * Proses file gambar → base64 JPEG (resize ke max 1200px).
 * @param {File} file
 * @returns {Promise<string>} base64 string
 */
const processImage = (file) => new Promise((resolve, reject) => {
  const img = new window.Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let { width, height } = img;
    const maxDim = 1200;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    resolve(dataUrl.split(',')[1]);
  };
  img.onerror = () => reject(new Error('Gagal memproses gambar'));
  img.src = URL.createObjectURL(file);
});

/**
 * Proses file ZIP → ekstrak semua file teks → gabungkan → base64.
 * @param {File} file
 * @returns {Promise<string>} base64 string
 */
const processZip = (file) => new Promise((resolve, reject) => {
  const VALID_TEXT_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py', '.sql', '.csv'];

  file.arrayBuffer().then(async (arrayBuffer) => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await new JSZip().loadAsync(arrayBuffer);

      let text = `--- KONTEN FILE ZIP (${file.name}) ---\n\n`;
      let fileCount = 0;

      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const isTextFile = VALID_TEXT_EXTS.some(ext => filename.toLowerCase().endsWith(ext));
        if (!isTextFile) continue;

        const content = await zipEntry.async('string');
        text += `\n\n=== AWAL FILE: ${filename} ===\n${content}\n=== AKHIR FILE: ${filename} ===\n`;
        fileCount++;
      }

      if (fileCount === 0) {
        text += 'Tidak ada file teks/kodingan yang bisa dibaca dalam ZIP ini.';
      }

      // DEBUG: Log jumlah file berhasil diekstrak
      console.debug(`[FileProcessor] ZIP: ${fileCount} file diekstrak dari ${file.name}`);

      resolve(btoa(unescape(encodeURIComponent(text))));
    } catch (err) {
      console.error('[FileProcessor] ZIP error:', err);
      reject(err);
    }
  });
});

/**
 * Proses file Excel (.xlsx / .xls) → konversi ke CSV → base64.
 * @param {File} file
 * @returns {Promise<string>} base64 string
 */
const processExcel = (file) => new Promise((resolve, reject) => {
  file.arrayBuffer().then(async (arrayBuffer) => {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += `\n\n--- Sheet: ${sheetName} ---\n\n` + XLSX.utils.sheet_to_csv(sheet);
      });

      // DEBUG: Log jumlah sheet
      console.debug(`[FileProcessor] Excel: ${workbook.SheetNames.length} sheet diproses dari ${file.name}`);

      resolve(btoa(unescape(encodeURIComponent(text))));
    } catch (err) {
      console.error('[FileProcessor] Excel error:', err);
      reject(err);
    }
  });
});

/**
 * Proses file biasa (PDF, TXT, dll) → base64.
 * @param {File} file
 * @returns {Promise<string>} base64 string
 */
const processGenericFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = (error) => {
    console.error('[FileProcessor] FileReader error:', error);
    reject(error);
  };
});

/**
 * Entry point: proses file apapun → kembalikan filePayload siap kirim ke backend.
 *
 * @param {File} file
 * @param {Function} onLog - callback untuk update log UI (optional)
 * @returns {Promise<{ name: string, mimeType: string, data: string } | null>}
 */
export const processAttachedFile = async (file, onLog = () => {}) => {
  if (!file) return null;

  const name = file.name;
  const nameLower = name.toLowerCase();

  onLog(`📁 Membaca file: ${name}...`);
  console.debug(`[FileProcessor] Memproses file: ${name} (${file.type || 'unknown type'})`);

  try {
    let base64Data;
    let finalFileName = name;
    let mimeType;

    if (file.type?.startsWith('image/')) {
      // --- IMAGE ---
      base64Data = await processImage(file);
      mimeType = 'image/jpeg';

    } else if (nameLower.endsWith('.zip')) {
      // --- ZIP ---
      base64Data = await processZip(file);
      finalFileName = name + '.txt'; // Trick backend baca sebagai teks biasa
      mimeType = 'text/plain';

    } else if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls')) {
      // --- EXCEL ---
      base64Data = await processExcel(file);
      finalFileName = name + '.csv'; // Trick backend baca sebagai CSV
      mimeType = 'text/csv';

    } else {
      // --- FILE BIASA (PDF, TXT, MD, dll) ---
      base64Data = await processGenericFile(file);
      mimeType = file.type || 'application/octet-stream';
    }

    return {
      name: finalFileName,
      mimeType,
      data: base64Data
    };

  } catch (err) {
    console.error(`[FileProcessor] Gagal memproses file ${name}:`, err);
    onLog(`❌ Gagal membaca file: ${err.message}`);
    return null;
  }
};
