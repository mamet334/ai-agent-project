const fs = require('fs');
const path = require('path');

const agentPath = path.join(__dirname, '../frontend/src/components/AIAgent.jsx');
let code = fs.readFileSync(agentPath, 'utf8');

// 1. Add Imports
if (!code.includes('import MemoryHealthDashboard from')) {
  code = code.replace(
    /import ObservabilityDashboard from '\.\/ObservabilityDashboard';/g,
    `import ObservabilityDashboard from './ObservabilityDashboard';
import MemoryHealthDashboard from './MemoryHealthDashboard';
import WorkDashboard from './WorkDashboard';`
  );
}

// 2. Add Sidebar Buttons
if (!code.includes("setActiveView('memoryhealth')")) {
  code = code.replace(
    /<button[^>]*onClick=\{\(\) => \{ setSidebarOpen\(false\); setActiveView\('observability'\); \}\}[^>]*>[\s\S]*?<\/button>/m,
    match => match + `\n            <button onClick={() => { setSidebarOpen(false); setActiveView('memoryhealth'); }} className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors \${activeView === 'memoryhealth' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}\`}><Database className="w-4 h-4" /> <span>Memory Health</span></button>
            <button onClick={() => { setSidebarOpen(false); setActiveView('work'); }} className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors \${activeView === 'work' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}\`}><Briefcase className="w-4 h-4" /> <span>Work Tracking</span></button>`
  );
}

// 3. Render the Dashboards
if (!code.includes('<MemoryHealthDashboard />')) {
  code = code.replace(
    /\{activeView === 'observability' && <ObservabilityDashboard \/>\}/g,
    `{activeView === 'observability' && <ObservabilityDashboard />}\n        {activeView === 'memoryhealth' && <MemoryHealthDashboard />}\n        {activeView === 'work' && <WorkDashboard />}`
  );
}

fs.writeFileSync(agentPath, code);
console.log('AIAgent patched with new dashboards!');
