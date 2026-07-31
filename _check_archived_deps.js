const fs = require('fs');
const path = require('path');

// Folders to scan
const SCAN_DIRS = ['backend', 'supabase/functions'];

// Patterns to search for (files that were moved to _knowledge_archive)
const ARCHIVED_PATTERNS = [
  // api/ patterns
  "'api/", '"api/', '`api/',
  "'../api/", '"../api/', '`../api/',
  "'../../api/", '"../../api/', '`../../api/',
  "'../../../api/", '"../../../api/', '`../../../api/',
  "require('api/", 'require("api/',
  "require('../api/", 'require("../../api/',
  "import('api/", 'import("api/',
  "import('../api/", 'import("../../api/',
  "from 'api/", 'from "api/',
  "from '../api/", 'from "../../api/',
  "from '../../../api/",
  "fetch('api/", 'fetch("api/',
  "fetch('../api/", 'fetch("../../api/',
  
  // lib/ patterns
  "'lib/", '"lib/', '`lib/',
  "'../lib/", '"../lib/', '`../lib/',
  "'../../lib/", '"../../lib/', '`../../lib/',
  "'../../../lib/", '"../../../lib/', '`../../../lib/',
  "require('lib/", 'require("lib/',
  "require('../lib/", 'require("../../lib/',
  "import('lib/", 'import("lib/',
  "import('../lib/", 'import("../../lib/',
  "from 'lib/", 'from "lib/',
  "from '../lib/", 'from "../../lib/',
  "from '../../../lib/",
  "fetch('lib/", 'fetch("lib/',
  "fetch('../lib/", 'fetch("../../lib/',
  
  // Specific file references
  "'memoryEngine", '"memoryEngine',
  "'supabaseClient", '"supabaseClient',
  "'decisionEngine", '"decisionEngine',
  "'truthScorer", '"truthScorer',
  "'truthScoringEngine", '"truthScoringEngine',
  "'ocb", '"ocb',
  "'memoryGovernor", '"memoryGovernor',
  "'override", '"override',
  "'read", '"read',
  "'write", '"write',
  "'behaviorMemoryEngine", '"behaviorMemoryEngine',
  "'cognitiveMemoryGovernor", '"cognitiveMemoryGovernor',
  "'contextUnifier", '"contextUnifier',
  "'globalCognitionLoop", '"globalCognitionLoop',
  "'intentPreprocessor", '"intentPreprocessor',
  "'memoryStabilityCore", '"memoryStabilityCore',
  "'semanticBridge", '"semanticBridge',
  "'shortTermMemory", '"shortTermMemory',
  "'singleCognitiveCore", '"singleCognitiveCore',
  "'truthGraphMemory", '"truthGraphMemory',
  "'unifiedCognition", '"unifiedCognition',
];

function collectAllFiles(dir) {
  const result = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return result;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      result.push(...collectAllFiles(fullPath));
    } else {
      result.push({ fullPath, relPath });
    }
  }
  return result;
}

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return '';
  }
}

console.log('===========================================================');
console.log('  ANALISIS DEPENDENSI — Backend & Supabase Functions');
console.log('  Mencari referensi ke api/ dan lib/ yang sudah diarsipkan');
console.log('===========================================================\n');

let totalFindings = 0;

for (const scanDir of SCAN_DIRS) {
  if (!fs.existsSync(scanDir)) {
    console.log(`[SKIP] ${scanDir} — folder tidak ditemukan\n`);
    continue;
  }
  
  const files = collectAllFiles(scanDir);
  console.log(`\n📁 Scanning: ${scanDir}/ (${files.length} files)\n`);
  
  for (const file of files) {
    const ext = path.extname(file.relPath);
    // Only scan code files
    if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.html'].includes(ext)) continue;
    
    const content = readFileContent(file.fullPath);
    if (!content) continue;
    
    const lines = content.split('\n');
    let fileHasMatch = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip comments
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) continue;
      
      for (const pattern of ARCHIVED_PATTERNS) {
        if (trimmedLine.includes(pattern)) {
          if (!fileHasMatch) {
            console.log(`  📄 ${file.relPath}:`);
            fileHasMatch = true;
          }
          console.log(`     ⚠️  Line ${i + 1}: ${trimmedLine.substring(0, 120)}`);
          totalFindings++;
          break;
        }
      }
    }
    
    if (!fileHasMatch) {
      // Check for any require/import that references a path starting with api/ or lib/
      const importRequireRegex = /(?:require|import|from)\s*\(?\s*['"`]([^'"`]+)['"`]/g;
      let match;
      while ((match = importRequireRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('api/') || importPath.startsWith('lib/') || 
            importPath.startsWith('../api/') || importPath.startsWith('../lib/') ||
            importPath.startsWith('../../api/') || importPath.startsWith('../../lib/')) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          console.log(`  📄 ${file.relPath}:`);
          console.log(`     ⚠️  Line ${lineNum}: ${match[0].substring(0, 120)}`);
          totalFindings++;
        }
      }
    }
  }
}

console.log('\n===========================================================');
if (totalFindings === 0) {
  console.log('  ✅ KESIMPULAN: TIDAK ADA dependensi ke api/ atau lib/');
  console.log('  Semua file backend dan supabase functions AMAN.');
  console.log('  Folder api/ dan lib/ sudah 100% aman di _knowledge_archive/');
} else {
  console.log(`  ⚠️  DITEMUKAN ${totalFindings} referensi ke api/ atau lib/`);
  console.log('  Perlu tindakan sebelum folder benar-benar diarsipkan.');
}
console.log('===========================================================');
