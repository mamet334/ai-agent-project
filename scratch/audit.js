const fs = require('fs');
const path = require('path');

const rootDir = "d:\\SLAMET\\other\\ai-agent-project";
const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.svelte-kit', '.gemini', '.vscode', 'supabase\\.branches']);

function getTree(startPath, maxDepth) {
    const tree = {};
    
    function walk(currentPath, currentDepth) {
        if (currentDepth > maxDepth) return;
        
        let items = [];
        try {
            items = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) {
            return;
        }
        
        const dirs = [];
        let fileCount = 0;
        
        for (const item of items) {
            if (item.isDirectory()) {
                if (!ignoreDirs.has(item.name)) {
                    dirs.push(item.name);
                    walk(path.join(currentPath, item.name), currentDepth + 1);
                }
            } else {
                fileCount++;
            }
        }
        
        let relPath = path.relative(rootDir, currentPath);
        if (relPath === '') relPath = 'ROOT';
        
        // only store up to max depth in the tree structure
        if (currentDepth <= maxDepth) {
            tree[relPath] = { dirs, files: fileCount };
        }
    }
    
    walk(startPath, 0);
    return tree;
}

function countLoc(startPath) {
    let totalFiles = 0;
    let totalLoc = 0;
    const locByExt = {};
    
    function walk(currentPath) {
        let items = [];
        try {
            items = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) {
            return;
        }
        
        for (const item of items) {
            const fullPath = path.join(currentPath, item.name);
            if (item.isDirectory()) {
                if (!ignoreDirs.has(item.name)) {
                    walk(fullPath);
                }
            } else {
                const ext = path.extname(item.name).toLowerCase();
                if (['.ts', '.js', '.svelte', '.py', '.html', '.css', '.json'].includes(ext)) {
                    totalFiles++;
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n').length;
                        totalLoc += lines;
                        locByExt[ext] = (locByExt[ext] || 0) + lines;
                    } catch (e) {}
                }
            }
        }
    }
    
    walk(startPath);
    return { totalFiles, totalLoc, locByExt };
}

function getBundleSize() {
    let bundleSize = 0;
    
    function walk(currentPath) {
        let items = [];
        try {
            items = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const item of items) {
            const fullPath = path.join(currentPath, item.name);
            if (item.isDirectory()) {
                walk(fullPath);
            } else {
                bundleSize += fs.statSync(fullPath).size;
            }
        }
    }
    
    const distPath = path.join(rootDir, 'frontend', 'dist');
    const buildPath = path.join(rootDir, 'frontend', 'build');
    
    if (fs.existsSync(distPath)) walk(distPath);
    else if (fs.existsSync(buildPath)) walk(buildPath);
    
    return bundleSize;
}

const tree = getTree(rootDir, 3);
const stats = countLoc(rootDir);
const bundleSize = getBundleSize();

stats.bundleSizeBytes = bundleSize;

const result = { tree, stats };

fs.writeFileSync(path.join(rootDir, 'scratch', 'audit_result.json'), JSON.stringify(result, null, 2));
console.log("Done");
