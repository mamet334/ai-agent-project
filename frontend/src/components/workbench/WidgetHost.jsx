import React, { Suspense, useState } from 'react';
import { Maximize2, Minimize2, Minus, ChevronDown, ChevronUp, X, AlertTriangle, GripHorizontal } from 'lucide-react';
import { serviceManager } from '../../core/runtime/ServiceManager';

/**
 * WidgetHost — Container widget dengan header fungsional
 *
 * Fitur tombol header:
 *  ≡  (Minus)    → Collapse/Expand widget (sembunyikan isi, hanya tampil header)
 *  ↗  (Maximize) → Toggle fullscreen overlay widget
 *  ✕  (X)        → Hapus widget dari zone (butuh prop onClose dari parent)
 */

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
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
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

export default function WidgetHost({ widgetId, onClose, dragHandleListeners, dragHandleAttributes }) {
  const widgetRegistry = serviceManager.get('WidgetRegistry');
  const widgetMeta = widgetRegistry?.getWidget(widgetId);

  // ── State lokal widget ──
  const [collapsed, setCollapsed] = useState(false);   // Collapse/expand isi widget
  const [fullscreen, setFullscreen] = useState(false); // Fullscreen overlay

  if (!widgetMeta) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/50 rounded text-red-400 text-xs">
        Widget Not Found: {widgetId}
      </div>
    );
  }

  const WidgetComponent = widgetMeta.component;

  // ── Fullscreen overlay ──
  const FullscreenWrapper = ({ children }) => (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900 border border-slate-700 shadow-2xl rounded-lg overflow-hidden">
      {children}
    </div>
  );

  const containerClasses = fullscreen
    ? '' // fullscreen dirender via FullscreenWrapper
    : 'flex flex-col bg-slate-900 border border-slate-800 rounded-lg overflow-hidden h-full';

  const content = (
    <div className={containerClasses}>
      {/* ── Widget Header ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/60 border-b border-slate-700/50 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag handle */}
          <span
            className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors shrink-0"
            title="Drag to move widget"
            {...(dragHandleAttributes || {})}
            {...(dragHandleListeners || {})}
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </span>
          {/* Status dot + name */}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-300 truncate">{widgetMeta.name}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Collapse / Expand */}
          <button
            type="button"
            onClick={() => setCollapsed(prev => !prev)}
            className="p-1 hover:bg-slate-700 text-slate-500 hover:text-slate-300 rounded transition-colors"
            title={collapsed ? 'Expand widget' : 'Collapse widget'}
          >
            {collapsed
              ? <ChevronDown className="w-3 h-3" />
              : <Minus className="w-3 h-3" />
            }
          </button>

          {/* Fullscreen / Restore */}
          <button
            type="button"
            onClick={() => setFullscreen(prev => !prev)}
            className="p-1 hover:bg-slate-700 text-slate-500 hover:text-slate-300 rounded transition-colors"
            title={fullscreen ? 'Keluar fullscreen' : 'Fullscreen widget'}
          >
            {fullscreen
              ? <Minimize2 className="w-3 h-3" />
              : <Maximize2 className="w-3 h-3" />
            }
          </button>

          {/* Close — hanya tampil jika onClose prop tersedia */}
          {onClose && (
            <button
              type="button"
              onClick={() => onClose(widgetId)}
              className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
              title="Hapus widget"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Widget Content ── */}
      {!collapsed && (
        <div className="flex-1 overflow-auto custom-scrollbar bg-slate-950 p-2 relative min-h-0">
          <WidgetErrorBoundary widgetId={widgetId}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                Loading {widgetMeta.name}...
              </div>
            }>
              {WidgetComponent
                ? <WidgetComponent />
                : <div className="text-slate-500 text-xs p-2">No component provided for {widgetId}</div>
              }
            </Suspense>
          </WidgetErrorBoundary>
        </div>
      )}

      {/* Collapsed state: tampilkan info ringkas */}
      {collapsed && (
        <div className="px-3 py-2 text-[10px] text-slate-600 font-mono italic">
          Widget collapsed — klik ▾ untuk expand
        </div>
      )}
    </div>
  );

  // Jika fullscreen, bungkus dengan overlay
  if (fullscreen) {
    return <FullscreenWrapper>{content}</FullscreenWrapper>;
  }

  return content;
}
