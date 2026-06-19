const fs = require('fs');
let code = fs.readFileSync('frontend/src/components/AIAgent.jsx', 'utf8');

// 1. Add Import
if (!code.includes('import ObservabilityDashboard from')) {
  code = code.replace(
    /import MonitoringDashboard from '\.\/MonitoringDashboard';/g,
    `import MonitoringDashboard from './MonitoringDashboard';\nimport ObservabilityDashboard from './ObservabilityDashboard';`
  );
}

// 2. Add Sidebar Button
if (!code.includes("setActiveView('observability')")) {
  code = code.replace(
    /<button[^>]*onClick=\{\(\) => \{ setSidebarOpen\(false\); setActiveView\('monitoring'\); \}\}[^>]*>[\s\S]*?<\/button>/m,
    match => match + `\n            <button onClick={() => { setSidebarOpen(false); setActiveView('observability'); }} className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors \${activeView === 'observability' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}\`}><Activity className="w-4 h-4" /> <span>AI Observability</span></button>`
  );
}

// 3. Render the Dashboard
if (!code.includes('<ObservabilityDashboard />')) {
  code = code.replace(
    /\{activeView === 'monitoring' && <MonitoringDashboard \/>\}/g,
    `{activeView === 'monitoring' && <MonitoringDashboard />}\n        {activeView === 'observability' && <ObservabilityDashboard />}`
  );
}

fs.writeFileSync('frontend/src/components/AIAgent.jsx', code);
console.log('AIAgent patched successfully.');
