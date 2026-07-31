import fs from 'fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractText() {
    try {
        console.log("Mengekstrak teks dari PDF...");
        const dataBuffer = await fs.readFile('Buku-panduan-AI-BAHASA-INDONESIA_compressed.pdf');
        const uint8Array = new Uint8Array(dataBuffer);
        const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
        
        let fullText = "";
        
        for(let i=1; i<=pdf.numPages; i++){
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(s => s.str).join(' ');
            fullText += pageText + "\n\n";
        }
        
        await fs.writeFile('Buku-panduan-AI.txt', fullText);
        console.log("Selesai! Teks disimpan ke Buku-panduan-AI.txt");
    } catch(e) {
        console.error(e);
    }
}

extractText();
