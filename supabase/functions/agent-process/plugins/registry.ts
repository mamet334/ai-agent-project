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
export const getPluginPromptList = (requestedTools?: string[], desktopOSMode: boolean = false) => {
  const toolAliases: Record<string, string> = {
    'web_search': 'researcher',
    'code_executor': 'coder',
    'web_scraper': 'scraper',
    'rag_search': 'rag_search'
  };

  const resolvedTools = requestedTools ? requestedTools.map(t => toolAliases[t] || t) : [];

  return plugins
    .filter(p => {
      // 1. Strict Whitelisting
      if (resolvedTools && resolvedTools.length > 0) {
        if (!resolvedTools.includes(p.name)) return false;
      }
      
      // 2. Keamanan tambahan: file_analyzer khusus Desktop OS Mode
      if (p.name === 'file_analyzer' && !desktopOSMode) return false;
      
      return true;
    })
    .map((p, index) => `${index + 1}. "${p.name}": ${p.description}`).join('\n');
};

export const getPluginByName = (name: string) => {
  return plugins.find(p => p.name === name);
};
