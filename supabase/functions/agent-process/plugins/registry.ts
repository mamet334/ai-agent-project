import researcher from './researcher.ts';
import scraper from './scraper.ts';
import coder from './coder.ts';
import communicator from './communicator.ts';

// Daftarkan semua plugin di sini
export const plugins = [
  researcher,
  scraper,
  coder,
  communicator
];

// Fungsi helper untuk membangun daftar tool otomatis bagi LLM
export const getPluginPromptList = () => {
  return plugins.map((p, index) => `${index + 1}. "${p.name}": ${p.description}`).join('\n');
};

export const getPluginByName = (name: string) => {
  return plugins.find(p => p.name === name);
};
