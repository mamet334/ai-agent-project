import researcher from './researcher.ts';
import scraper from './scraper.ts';
import coder from './coder.ts';
import communicator from './communicator.ts';
import logika from './logic.ts';
import bahasa from './language.ts';
import debate from './debate.ts';
import deepResearch from './deep_research.ts';
import youtubeAnalyst from './youtube_analyst.ts';
import cronManager from './cron_manager.ts';
import fileAnalyzer from './file_analyzer.ts';
import shopeeNinja from './shopee_ninja.ts';

// Daftarkan semua plugin di sini
export const plugins = [
  researcher,
  scraper,
  coder,
  communicator,
  logika,
  bahasa,
  debate,
  deepResearch,
  youtubeAnalyst,
  cronManager,
  fileAnalyzer,
  shopeeNinja
];

// Fungsi helper untuk membangun daftar tool otomatis bagi LLM
export const getPluginPromptList = () => {
  return plugins.map((p, index) => `${index + 1}. "${p.name}": ${p.description}`).join('\n');
};

export const getPluginByName = (name: string) => {
  return plugins.find(p => p.name === name);
};
