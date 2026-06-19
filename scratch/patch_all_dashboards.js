const fs = require('fs');
const path = require('path');

const agentPath = path.join(__dirname, '../frontend/src/components/AIAgent.jsx');
let code = fs.readFileSync(agentPath, 'utf8');

// 1. Add Imports
const importsToAdd = `
import ObservabilityDashboard from './ObservabilityDashboard';
import MemoryHealthDashboard from './MemoryHealthDashboard';
import WorkDashboard from './WorkDashboard';
`;

if (!code.includes('import MemoryHealthDashboard')) {
  code = code.replace(
    /import MonitoringDashboard from '\.\/MonitoringDashboard';/,
    `import MonitoringDashboard from './MonitoringDashboard';${importsToAdd}`
  );
}

// 2. Add Buttons
const buttonsToAdd = `
                  <button
                    onClick={() => setActiveView('observability')}
                    className={\`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 \${activeView === 'observability' ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}\`}
                  >
                    <Activity className="w-4 h-4" /> Observability
                  </button>
                  <button
                    onClick={() => setActiveView('memoryhealth')}
                    className={\`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 \${activeView === 'memoryhealth' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}\`}
                  >
                    <Database className="w-4 h-4" /> Mem Health
                  </button>
                  <button
                    onClick={() => setActiveView('work')}
                    className={\`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 \${activeView === 'work' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}\`}
                  >
                    <Briefcase className="w-4 h-4" /> Work Track
                  </button>
`;

if (!code.includes("setActiveView('memoryhealth')")) {
  code = code.replace(
    /(<button\s+onClick=\{\(\) => setActiveView\('shopee'\)\}[\s\S]*?<\/button>)/,
    `$1${buttonsToAdd}`
  );
}

// 3. Render Dashboards
const rendersToAdd = `
          ) : activeView === 'observability' ? (
            <ObservabilityDashboard />
          ) : activeView === 'memoryhealth' ? (
            <MemoryHealthDashboard />
          ) : activeView === 'work' ? (
            <WorkDashboard />
`;

if (!code.includes('<MemoryHealthDashboard />')) {
  code = code.replace(
    /(<MonitoringDashboard \/>\s*\n\s*\) : activeView === 'billing' \? \()/,
    `$1`
  ).replace(
    /(<ShopeeDashboard \/>\s*\n\s*\) : activeView === 'cron' \? \()/,
    `${rendersToAdd}$1`
  );
}

fs.writeFileSync(agentPath, code);
console.log('AIAgent fully patched with robust regex!');
