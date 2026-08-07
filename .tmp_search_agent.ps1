$root = Get-Location
$exclude = 'node_modules', 'dist', '_knowledge_archive', '.git'
$files = Get-ChildItem -Path $root -Recurse -File -Include *.js,*.ts,*.tsx,*.jsx,*.html,*.vue,*.json,*.mjs,*.cjs,*.py,*.astro,*.svelte
foreach ($f in $files) {
    $skip = $false
    foreach ($ex in $exclude) {
        if ($f.FullName -match [regex]::Escape($ex)) { $skip = $true; break }
    }
    if ($skip) { continue }
    $matches = Select-String -Path $f.FullName -Pattern 'agent-process' -SimpleMatch
    foreach ($m in $matches) {
        Write-Output ("{0}:{1}: {2}" -f $f.FullName, $m.LineNumber, $m.Line.Trim())
    }
}
Write-Output "=== SEARCH DONE ==="
