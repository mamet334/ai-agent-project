import React, { Suspense } from 'react';
import { Maximize2, Minus, X, AlertTriangle } from 'lucide-react';
import { serviceManager } from '../../core/runtime/ServiceManager';

class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[WidgetHost] Module Load Failure for ${this.props.widgetId}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-slate-900 border border-slate-800 rounded">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <div className="text-xs font-bold text-slate-300">Module Load Failure</div>
          <div className="text-[10px] text-slate-500 mt-1 max-w-[200px] break-words">
            Failed to load widget: {this.props.widgetId}
          </div>
          <button 
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            className="mt-3 px-3 py-1 bg-slate-800 text-emerald-500 text-[10px] rounded border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WidgetHost({ widgetId, onClose }) {
  const widgetRegistry = serviceManager.get('WidgetRegistry');
  const widgetMeta = widgetRegistry.getWidget(widgetId);

  if (!widgetMeta) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/50 rounded text-red-400 text-xs">
        Widget Not Found: {widgetId}
      </div>
    );
  }

  const WidgetComponent = widgetMeta.component;

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-lg overflow-hidden h-full">
      {/* Widget Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-800 cursor-move shrink-0">
        <div className="flex items-center gap-2">
          {/* We assume lucide icons will be handled elsewhere or passed statically, 
              for now we just use a generic dot if icon string is passed */}
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-semibold text-slate-300">{widgetMeta.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 hover:bg-slate-700 text-slate-500 hover:text-slate-300 rounded transition-colors" title="Minimize">
            <Minus className="w-3 h-3" />
          </button>
          <button className="p-1 hover:bg-slate-700 text-slate-500 hover:text-slate-300 rounded transition-colors" title="Maximize">
            <Maximize2 className="w-3 h-3" />
          </button>
          {onClose && (
            <button 
              onClick={() => onClose(widgetId)}
              className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors" 
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      
      {/* Widget Content */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-950 p-2 relative">
        <WidgetErrorBoundary widgetId={widgetId}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              Loading {widgetMeta.name}...
            </div>
          }>
            {WidgetComponent ? <WidgetComponent /> : (
              <div className="text-slate-500 text-xs">No component provided</div>
            )}
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    </div>
  );
}
