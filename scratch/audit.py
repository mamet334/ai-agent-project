import os
import json

root_dir = r"d:\SLAMET\other\ai-agent-project"
ignore_dirs = {'node_modules', '.git', 'dist', 'build', '.svelte-kit', '.gemini', '.vscode', 'supabase\\.branches'}

def get_tree(startpath, max_depth):
    tree = {}
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        level = root.replace(startpath, '').count(os.sep)
        if level >= max_depth:
            del dirs[:]
        
        rel_path = os.path.relpath(root, startpath)
        if rel_path == '.':
            rel_path = 'ROOT'
        tree[rel_path] = {'dirs': dirs, 'files': len(files)}
    return tree

def count_loc(startpath):
    total_files = 0
    total_loc = 0
    loc_by_ext = {}
    
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in {'.ts', '.js', '.svelte', '.py', '.html', '.css', '.json'}:
                total_files += 1
                try:
                    with open(os.path.join(root, f), 'r', encoding='utf-8') as file:
                        lines = sum(1 for _ in file)
                        total_loc += lines
                        loc_by_ext[ext] = loc_by_ext.get(ext, 0) + lines
                except Exception:
                    pass
    return total_files, total_loc, loc_by_ext

tree = get_tree(root_dir, 3)
files, loc, loc_by_ext = count_loc(root_dir)

# Find bundle size if dist or build exists
bundle_size = 0
dist_path = os.path.join(root_dir, 'frontend', 'dist')
if os.path.exists(dist_path):
    for root, dirs, files in os.walk(dist_path):
        for f in files:
            bundle_size += os.path.getsize(os.path.join(root, f))
elif os.path.exists(os.path.join(root_dir, 'frontend', 'build')):
    for root, dirs, files in os.walk(os.path.join(root_dir, 'frontend', 'build')):
        for f in files:
            bundle_size += os.path.getsize(os.path.join(root, f))

result = {
    'tree': tree,
    'stats': {
        'total_files': files,
        'total_loc': loc,
        'loc_by_ext': loc_by_ext,
        'bundle_size_bytes': bundle_size
    }
}

with open(os.path.join(root_dir, 'scratch', 'audit_result.json'), 'w') as f:
    json.dump(result, f, indent=2)

print("Done")
