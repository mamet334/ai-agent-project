import * as cheerio from 'npm:cheerio';

export default {
  name: 'scraper',
  description: 'Mengekstrak teks langsung dari sebuah URL spesifik.',
  execute: async ({ task, accumulatedContext }) => {
    try {
      const urlMatch = task.match(/(https?:\/\/[^\s]+)/g) || accumulatedContext.match(/(https?:\/\/[^\s]+)/g);
      const urlToScrape = urlMatch ? urlMatch[0] : null;
      if (urlToScrape) {
        const scrapeRes = await fetch(urlToScrape);
        const html = await scrapeRes.text();
        const $ = cheerio.load(html);
        $('script, style, nav, footer, header').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        return {
          output: `Isi konten dari ${urlToScrape}:\n\n${text.substring(0, 10000)}`,
          sources: [{ title: $('title').text() || 'Scraped Page', uri: urlToScrape }],
          toolExecution: { name: 'web_scraper', args: { url: urlToScrape } }
        };
      } else {
        return { output: "Gagal memproses URL: URL tidak ditemukan." };
      }
    } catch (err) {
      return { output: `Scraping gagal: ${err}` };
    }
  }
};
