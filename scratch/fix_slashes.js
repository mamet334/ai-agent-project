const fs = require('fs');
['WorkDashboard.jsx', 'MemoryHealthDashboard.jsx', 'ObservabilityDashboard.jsx'].forEach(file => {
  const p = 'frontend/src/components/' + file;
  if (fs.existsSync(p)) {
    let code = fs.readFileSync(p, 'utf8');
    // Replace {\` with {`
    code = code.replace(/className=\{\\`w-4/g, 'className={`w-4');
    // Replace \`} with `}
    code = code.replace(/''\}\\`\}/g, "''}`}").replace(/400'\s*:\s*''\}\\`\}/g, "400' : ''}`}");
    // Replace \${ with ${
    code = code.replace(/\\\$\{/g, '${');
    fs.writeFileSync(p, code);
  }
});
console.log('Fixed backslash escaping in dashboards.');
