import * as cheerio from 'npm:cheerio';

export default {
  name: 'scraper',
  description: 'Mengekstrak teks langsung dari sebuah URL spesifik.',
  execute: async ({ task, accumulatedContext }) => {
    try {
      const urlMatch = task.match(/(https?:\/\/[^\s]+)/g) || accumulatedContext.match(/(https?:\/\/[^\s]+)/g);
      const urlToScrape = urlMatch ? urlMatch[0] : null;
      if (urlToScrape) {
        // Upgrade: Menggunakan Jina AI (r.jina.ai) untuk menembus JS/CAPTCHA/Cloudflare dasar
        const scrapeRes = await fetch(`https://r.jina.ai/${urlToScrape}`);
        const markdown = await scrapeRes.text();
        
        return {
          output: `Isi konten dari ${urlToScrape}:\n\n${markdown.substring(0, 15000)}`,
          sources: [{ title: 'Web Scraped Page', uri: urlToScrape }],
          toolExecution: { name: 'web_scraper', args: { url: urlToScrape, bypass_active: true } }
        };
      } else {
        return { output: "Gagal memproses URL: URL tidak ditemukan." };
      }
    } catch (err) {
      return { output: `Scraping gagal: ${err}` };
    }
  }
};
