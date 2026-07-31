import fs from 'fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractText() {
    try {
        const dataBuffer = await fs.readFile('Buku-panduan-AI-BAHASA-INDONESIA_compressed.pdf');
        const uint8Array = new Uint8Array(dataBuffer);
        const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
        
        console.log("Pages:", pdf.numPages);
        let fullText = "";
        
        // Read first 5 pages to get the gist
        const maxPages = Math.min(pdf.numPages, 5);
        for(let i=1; i<=maxPages; i++){
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(s => s.str).join(' ');
            fullText += pageText + "\n";
        }
        console.log("TEXT START==================\n");
        console.log(fullText.substring(0, 3000));
        console.log("\nTEXT END==================");
    } catch(e) {
        console.error(e);
    }
}

extractText();
