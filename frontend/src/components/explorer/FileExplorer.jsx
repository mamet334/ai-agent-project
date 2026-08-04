import React, { useState, useEffect, useCallback, useRef } from 'react';
import { kernel } from '../../core/runtime/Kernel';
import {
  Folder, FolderOpen, FileText, FileCode, FileJson, File,
  Search, X, Copy, Check, Loader2, ChevronRight, ChevronDown,
  Home, RefreshCw, AlertTriangle, Database
} from 'lucide-react';

const EXT_MAP = {
  js: { c: 'text-yellow-400' }, jsx: { c: 'text-cyan-400' }, ts: { c: 'text-blue-400' },
  tsx: { c: 'text-cyan-400' }, css: { c: 'text-pink-400' }, scss: { c: 'text-pink-400' },
  html: { c: 'text-orange-400' }, json: { c: 'text-emerald-400' }, md: { c: 'text-slate-300' },
  txt: { c: 'text-slate-300' }, py: { c: 'text-blue-300' }, yml: { c: 'text-rose-300' },
  yaml: { c: 'text-rose-300' }, sh: { c: 'text-emerald-300' }, env: { c: 'text-slate-400' }
};

const LANG_LABEL = {
  javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS', html: 'HTML',
  json: 'JSON', markdown: 'Markdown', text: 'Plain Text', python: 'Python',
  yaml: 'YAML', bash: 'Bash', unknown: 'Unknown'
};

const KEYWORDS = new Set([
  'function','const','let','var','return','import','export','from','class','extends',
  'if','else','for','while','do','switch','case','break','continue','new','delete',
  'typeof','instanceof','this','await','async','yield','try','catch','finally','throw',
  'def','lambda','pass','with','as','in','of','true','false','null','undefined',
  'None','True','False','and','or','not','is'
]);

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>');
}

function highlightCode(code) {
  if (!code) return '';
  const esc = escapeHtml(code);
  let html = esc.replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="text-amber-300">$1</span>');
  const parts = html.split(/(<span[^>]*>.*?<\/span>)/g);
  html = parts.map(p => {
    if (p.startsWith('<span')) return p;
    return p.split(/([a-zA-Z_$][\w$]*)/g)
      .map(t => KEYWORDS.has(t) ? `<span class="text-purple-400 font-semibold">${t}</span>` : t)
      .join('');
  }).join('');
  html = html.replace(/\/\/.*$/gm, m => `<span class="text-slate-600 italic">${m}</span>`);
  html = html.replace(/#.*$/gm, m => `<span class="text-slate-600 italic">${m}</span>`);
  html = html.replace(/\/\*[\s\S]*?\*\//g, m => `<span class="text-slate-600 italic">${m}</span>`);
  return html;
}

function formatSize(b) {
  if (!b || b <= 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function FileExplorer() {
  const [service, setService] = useState(null);
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [dirError, setDirError] = useState(null);
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileMeta, setFileMeta] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [highlightedHtml, setHighlightedHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const searchTimer = useRef(null);

  // ── Ambil RepositoryReaderService dari Kernel ──
  useEffect(() => {
    let interval = null;
    const getService = () => {
      if (kernel.serviceManager?.has('RepositoryReaderService')) {
        setService(kernel.serviceManager.get('RepositoryReaderService'));
        if (interval) clearInterval(interval);
        return true;
      }
      return false;
    };
    if (!getService() && kernel.status !== 'RUNNING') {
      interval = setInterval(() => { if (getService()) clearInterval(interval); }, 500);
    }
    return () => { if (interval) clearInterval(interval); };
  }, []);

// ── Muat direktori ──
  const loadDirectory = useCallback(async (dirPath = '') => {
    if (!service) {
      setDirError('Service RepositoryReader belum tersedia.');
      return;
    }
    setLoadingDir(true);
    setDirError(null);
    // Reset entries agar UI tidak menampilkan file dari folder sebelumnya
    setEntries([]);
    try {
      const result = await service.listDirectory(dirPath);
      // Normalisasi tipe: pastikan ada field 'type' yang valid ('dir'/'file')
      const normalized = (result || []).map(item => {
        const type = item.type === 'dir' || item.type === 'file' ? item.type : 'file';
        return { ...item, type };
      });
      const sorted = [...normalized].sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      setEntries(sorted);
    } catch (e) {
      // Jangan silent fail — set error state agar UI menampilkan pesan
      setDirError(e.message || 'Gagal memuat direktori');
      setEntries([]);
    } finally {
      setLoadingDir(false);
    }
  }, [service]);

  useEffect(() => {
    if (service) loadDirectory('');
  }, [service, loadDirectory]);

  // ── Muat file ──
  const loadFile = useCallback(async (filePath) => {
    if (!service) return;
    setLoadingFile(true);
    setFileError(null);
    setFileMeta(null);
    setFileContent('');
    setHighlightedHtml('');
    try {
      const result = await service.readFile(filePath);
      if (!result || result.content === undefined || result.content === null) {
        setFileError('File kosong atau tidak dapat dibaca.');
      } else {
        setFileContent(result.content);
        setFileMeta({ path: result.path || filePath, size: result.size || result.content.length, backend: result.backend || 'unknown' });
        setHighlightedHtml(highlightCode(result.content));
      }
    } catch (e) {
      setFileError(e.message || 'Gagal membaca file');
    } finally {
      setLoadingFile(false);
    }
  }, [service]);

  // ── Pencarian debounce ──
  useEffect(() => {
    if (!service) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setSearching(false); setSearchError(null); return; }
    setSearching(true);
    setSearchError(null);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await service.searchFiles(q);
        setSearchResults(results || []);
      } catch (e) {
        setSearchError(e.message || 'Pencarian gagal');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, service]);

  // ── Navigasi ──
  const breadcrumbs = currentPath ? currentPath.split('/').map((seg, i) => ({ name: seg, path: currentPath.split('/').slice(0, i + 1).join('/') })) : [];

  const navigateTo = (path) => {
    setCurrentPath(path || '');
    setExpandedFolders(prev => ({ ...prev, [path || 'root']: true }));
    loadDirectory(path || '');
    setSelectedFilePath(null); setFileContent(''); setFileMeta(null); setHighlightedHtml(''); setFileError(null);
  };

const toggleFolder = (item) => {
    if (expandedFolders[item.path]) { setExpandedFolders(prev => ({ ...prev, [item.path]: false })); return; }
    setExpandedFolders(prev => ({ ...prev, [item.path]: true }));
    setCurrentPath(item.path);
    loadDirectory(item.path);
    // ✅ LOGIKA FOLDER: buka folder, kosongkan panel preview (ini bukan file)
    setSelectedFilePath(null);
    setFileContent(null);
    setFileMeta(null);
    setHighlightedHtml('');
    setFileError(null);
  };

  const openFile = (filePath) => {
    setSelectedFilePath(filePath);
    loadFile(filePath);
    const el = document.getElementById('file-preview-scroll');
    if (el) el.scrollTop = 0;
  };

  const handleCopyPath = async (path) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { console.warn('[FileExplorer] Gagal menyalin:', e); }
  };

  const getFileIcon = (name) => {
    const ext = name?.split('.').pop()?.toLowerCase() || '';
    const meta = EXT_MAP[ext];
    let IconComp;
    if (ext === 'json') IconComp = FileJson;
    else if (meta || ['js', 'jsx', 'ts', 'tsx', 'py', 'css', 'scss', 'html', 'sh'].includes(ext)) IconComp = FileCode;
    else if (ext === 'md' || ext === 'txt' || ext === 'yml' || ext === 'yaml' || ext === 'env') IconComp = FileText;
    else IconComp = File;
    return { IconComp, color: meta?.c || 'text-slate-400' };
  };

  const getLang = (path) => {
    const ext = path?.split('.').pop()?.toLowerCase() || '';
    const map = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', css: 'css', scss: 'scss', html: 'html', json: 'json', md: 'markdown', txt: 'text', py: 'python', yml: 'yaml', yaml: 'yaml', sh: 'bash' };
    return map[ext] || 'unknown';
  };

  const selectedName = selectedFilePath?.split('/').pop() || '';
  const { IconComp: SelIcon, color: selColor } = selectedFilePath ? getFileIcon(selectedName) : { IconComp: File, color: 'text-slate-400' };
  const isElectron = service?.isElectron;
  const backendLabel = fileMeta?.backend === 'electron' ? 'FS Lokal' : fileMeta?.backend === 'github-raw' ? 'GitHub API' : 'Cache';

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200 overflow-hidden font-sans relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/70 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <FolderOpen className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold tracking-widest uppercase text-slate-300">File Explorer</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 font-mono">{isElectron ? 'Electron' : 'GitHub'}</span>
        </div>
        <div className="flex-1 max-w-md mx-auto relative min-w-[120px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari file di repository..." className="w-full pl-9 pr-8 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 focus:outline-none transition-colors" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <button onClick={() => navigateTo('')} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-xs transition-colors shrink-0" title="Ke root"><Home className="w-3.5 h-3.5" /> Root</button>
        <button onClick={() => loadDirectory(currentPath)} className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 shrink-0" title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${loadingDir ? 'animate-spin' : ''}`} /></button>
      </div>

      {/* Dropdown search */}
      {searchQuery.trim() && (
        <div className="absolute top-[52px] left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-72 overflow-y-auto custom-scrollbar">
            {searching ? (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" /> Mencari...</div>
            ) : searchError ? (
              <div className="px-4 py-3 text-xs text-red-400 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> {searchError}</div>
            ) : searchResults.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-500">Tidak ada file cocok untuk "{searchQuery}"</div>
            ) : (
              <div className="py-1">
                {searchResults.map(rp => {
                  const name = rp.split('/').pop();
                  const icon = getFileIcon(name);
                  const IC = icon.IconComp;
                  return (
                    <button key={rp} onClick={() => { setSearchQuery(''); setSearchResults([]); openFile(rp); }} className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-800 text-left">
                      <IC className={`w-3.5 h-3.5 shrink-0 ${icon.color}`} />
                      <span className="text-xs text-slate-300 truncate">{name}</span>
                      <span className="text-[10px] text-slate-500 truncate ml-auto font-mono">{rp}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-slate-900/50 border-b border-slate-800 text-[11px] font-mono overflow-x-auto custom-scrollbar shrink-0">
        <button onClick={() => navigateTo('')} className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:text-purple-400 whitespace-nowrap ${currentPath === '' ? 'text-purple-400 font-semibold' : 'text-slate-400'}`}><FolderOpen className="w-3 h-3" /> root</button>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.path}>
            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
            <button onClick={() => navigateTo(crumb.path)} className={`px-1.5 py-0.5 rounded hover:text-purple-400 whitespace-nowrap ${idx === breadcrumbs.length - 1 ? 'text-purple-400 font-semibold' : 'text-slate-400'}`}>{crumb.name}</button>
          </React.Fragment>
        ))}
      </div>

      {/* Body split */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {/* Panel kiri: tree */}
        <div className="w-full md:w-72 md:max-w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col min-h-0 bg-slate-900/30">
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 border-b border-slate-800/70 shrink-0">Direktori {isElectron ? '(Lokal)' : '(GitHub)'}</div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {loadingDir ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /><span className="text-[11px] font-mono">Memuat direktori...</span></div>
            ) : dirError ? (
              <div className="mx-2 mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[11px] text-red-400"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span className="break-words">{dirError}</span></div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-600 gap-2"><FolderOpen className="w-8 h-8 opacity-40" /><p className="text-[11px]">Direktori kosong</p>{currentPath && <button onClick={() => navigateTo('')} className="text-[10px] text-purple-400 hover:text-purple-300 mt-1">← Kembali ke root</button>}</div>
            ) : (
              <div className="space-y-0.5">
                {entries.map((item) => {
                  if (item.type === 'dir') {
                    const isExpanded = !!expandedFolders[item.path];
                    return (
                      <button key={item.path} onClick={() => toggleFolder(item)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${currentPath === item.path ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'}`}>
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />}
                        {currentPath === item.path ? <FolderOpen className="w-4 h-4 text-purple-400 shrink-0" /> : <Folder className="w-4 h-4 text-blue-400 shrink-0" />}
                        <span className="text-xs truncate">{item.name}</span>
                      </button>
                    );
                  }
                  const icon = getFileIcon(item.name);
                  const IC = icon.IconComp;
                  const isActive = selectedFilePath === item.path || selectedFilePath === `${currentPath}/${item.name}`;
                  return (
                    <button key={item.path} onClick={() => openFile(item.path)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left group ${isActive ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'}`} title={item.path}>
                      <span className="w-3 shrink-0" />
                      <IC className={`w-4 h-4 shrink-0 ${icon.color}`} />
                      <span className="text-xs truncate flex-1">{item.name}</span>
                      <span className="text-[9px] text-slate-600 opacity-0 group-hover:opacity-100">{formatSize(item.size)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-slate-800/70 text-[9px] text-slate-600 font-mono flex items-center gap-1.5 shrink-0">
            <Database className="w-3 h-3 shrink-0" />
            <span className="truncate">{entries.length} item • {service ? (isElectron ? 'FS Lokal' : 'github/mamet334/mamet-ecosystem') : 'menunggu service...'}</span>
          </div>
        </div>

        {/* Panel kanan: preview */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0 bg-slate-900/50">
            {selectedFilePath ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <SelIcon className={`w-4 h-4 shrink-0 ${selColor}`} />
                  <span className="text-xs font-medium truncate text-slate-300">{selectedName}</span>
                  <span className="text-[9px] font-mono text-slate-500 truncate hidden sm:block">{selectedFilePath}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {fileMeta && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono">{LANG_LABEL[getLang(selectedFilePath)]}</span>}
                  {fileMeta && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono hidden sm:inline">{backendLabel} • {formatSize(fileMeta.size)}</span>}
                  <button onClick={() => handleCopyPath(selectedFilePath)} className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-[10px]" title="Salin path">
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span className="hidden sm:inline">{copied ? 'Tersalin' : 'Salin Path'}</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-500"><FileText className="w-4 h-4" /><span className="text-xs">Pilih file untuk melihat isinya</span></div>
            )}
          </div>
          <div id="file-preview-scroll" className="flex-1 overflow-auto custom-scrollbar bg-slate-950 p-4">
            {loadingFile ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /><span className="text-[11px] font-mono">Membaca file...</span></div>
            ) : fileError ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3"><AlertTriangle className="w-8 h-8 text-red-400/60" /><p className="text-xs text-red-400">{fileError}</p></div>
            ) : selectedFilePath ? (
              <pre className="text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: highlightedHtml || '<span class="text-slate-500">(File kosong)</span>' }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2"><FolderOpen className="w-12 h-12 opacity-30" /><p className="text-xs">Klik file di panel kiri untuk melihat isi</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
