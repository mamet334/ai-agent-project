import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Mamet OS Crash:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col h-screen w-screen bg-slate-950 items-center justify-center p-8 text-slate-300 font-mono text-sm">
          <div className="max-w-2xl w-full border border-red-500/30 bg-red-950/20 rounded-lg p-6">
            <h2 className="text-red-400 font-bold mb-4">MAMET OS KERNEL PANIC</h2>
            <p className="mb-4 text-xs text-slate-400">An unexpected runtime error occurred in the OS UI.</p>
            <div className="bg-slate-900 p-4 rounded overflow-auto text-[10px] text-red-300 border border-red-900/50 max-h-64 mb-4">
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-emerald-500 border border-slate-700"
            >
              REBOOT OS
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}
