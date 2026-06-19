const fs = require('fs');
const path = require('path');

const cronPath = path.join(__dirname, '../supabase/functions/cron-agent/index.ts');
let code = fs.readFileSync(cronPath, 'utf8');

// 1. Remove AI Call for Caption (Step B)
const stepBTarget = /\/\/ --- STEP B: AI BUNGKUS ULANG JADI KONTEN ORIGINAL ---[\s\S]*?(?=\/\/ --- AUTO-POST KE SOSIAL MEDIA ---)/;
const stepBReplacement = `// --- STEP B: BUNGKUS ULANG JADI KONTEN ORIGINAL (NON-AI TEMPLATE) ---
          const templates = [
            "Lagi nyari barang murah? Coba cek ini deh, mantul banget buat harga segini: [URL]",
            "Keracunan barang ini gara2 liat review, ternyata beneran bagus. Buat yang mau: [URL]",
            "Awalnya iseng beli, eh malah ketagihan. Kualitasnya oke parah! Cek aja di sini: [URL]",
            "Sumpah ini barang berguna banget, nyesel baru tau sekarang. Linknya: [URL]",
            "Buat yang lagi nyari [NAMA_PRODUK], ini rekomen sih. Mumpung lagi diskon: [URL]"
          ];
          const template = templates[Math.floor(Math.random() * templates.length)];
          const cleanName = (link.product_name || 'barang ini').replace('[AUTO-DISCOVERY]', '').trim();
          const aiMessageText = template.replace('[URL]', link.original_url).replace('[NAMA_PRODUK]', cleanName);

          `;

code = code.replace(stepBTarget, stepBReplacement);

// 2. Remove AI Call for Auto-Discovery
const discoveryTarget = /\/\/ Minta AI untuk mengekstrak link Shopee dari hasil pencarian[\s\S]*?(?=\/\/ Parse JSON dari output AI)/;
const discoveryReplacement = `// Ekstrak link Shopee menggunakan Regex (NON-AI)
            let aiOutput = "[]";
            const urlRegex = /https:\\/\\/shopee\\.co\\.id\\/[\\w\\.-]+(?:-i\\.\\d+\\.\\d+)?/g;
            const matchedUrls = searchContent.match(urlRegex) || [];
            
            // Filter unique URLs and ignore common non-product links
            const uniqueUrls = [...new Set(matchedUrls)].filter(url => 
              url.length > 30 && !url.includes('buyer') && !url.includes('cart')
            ).slice(0, 3);
            
            const extractedProducts = uniqueUrls.map(url => ({ 
              url, 
              name: "PRODUK TRENDING TERKINI" 
            }));
            
            aiOutput = JSON.stringify(extractedProducts);
            
            `;

code = code.replace(discoveryTarget, discoveryReplacement);

fs.writeFileSync(cronPath, code);
console.log('Cron Agent AI calls removed and replaced with NON-AI logic!');
