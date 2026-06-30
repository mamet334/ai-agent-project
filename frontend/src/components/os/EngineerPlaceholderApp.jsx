import React, { useState } from 'react';
import { Terminal } from 'lucide-react';

export default function EngineerPlaceholderApp() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 text-slate-300 p-8">
      <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
        <Terminal className="text-emerald-500 w-8 h-8" />
        <h1 className="text-2xl font-semibold">Engineer Application</h1>
      </div>
      
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg max-w-xl shadow-lg">
        <p className="text-sm text-slate-400 mb-4">
          This is the Phase 2 isolated Engineer App environment.
          In Phase 3, this will mount a dedicated WorkspaceManager context.
        </p>
        <p className="text-sm text-amber-500 mb-6 font-mono bg-amber-950/30 p-2 rounded">
          PERSISTENCE VALIDATION TEST:
        </p>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCount(c => c + 1)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
          >
            Increment Counter
          </button>
          <span className="text-xl font-mono text-emerald-400">Count: {count}</span>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Click the button, switch to the Assistant app (Chat icon on the left), and switch back. 
          The counter will NOT reset because the application lifecycle is preserved.
        </p>
      </div>
    </div>
  );
}
