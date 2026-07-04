import React, { useState, useEffect } from 'react';
import { serviceManager } from '../../core/runtime/ServiceManager';
import { LayoutGrid, Activity, Clock, ShieldCheck, CheckSquare, Zap, Box } from 'lucide-react';

const iconMap = {
  'widget:workspace-overview': LayoutGrid,
  'widget:system-status': Activity,
  'widget:current-activity': Zap,
  'widget:recent-events': Clock,
  'widget:pending-approval': CheckSquare,
  'widget:verification-summary': ShieldCheck,
  'widget:quick-actions': Zap
};

export default function HomeDashboard() {
  const [widgets, setWidgets] = useState([]);

  useEffect(() => {
    const metadataService = serviceManager.get('MetadataService');
    const widgetRegistry = serviceManager.get('WidgetRegistry');
    
    if (metadataService && widgetRegistry) {
      const layoutData = metadataService.getDashboardLayout()?.layout || [];
      const capabilities = metadataService.getCapabilities();
      
      const loadedWidgets = layoutData.map(item => {
        const widgetConfig = widgetRegistry.get(item.widgetId);
        if (!widgetConfig) return null;
        
        // Capability Check
        const hasCapability = widgetConfig.capabilities.every(capId => {
          const cap = capabilities.find(c => c.id === capId);
          return cap ? cap.enabled : false;
        });

        if (!hasCapability) return null;

        return { ...widgetConfig, colSpan: item.colSpan || 'col-span-1' };
      }).filter(Boolean);

      setWidgets(loadedWidgets);
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-y-auto text-slate-200 p-6 font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-emerald-500 mb-1">Mamet OS Ecosystem</h1>
        <p className="text-slate-400 text-sm">System Overview & Live Status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {widgets.map((widget) => {
          const WidgetComp = widget.component;
          const IconComp = iconMap[widget.id] || Box;
          
          return (
            <div key={widget.id} className={`${widget.colSpan} bg-slate-900 border border-slate-800 rounded-lg p-4`}>
              <div className="flex items-center gap-2 mb-4 text-emerald-400 border-b border-slate-800 pb-2">
                <IconComp size={18} />
                <h2 className="font-semibold text-sm">{widget.name}</h2>
              </div>
              <React.Suspense fallback={<div className="text-slate-500 text-xs animate-pulse">Loading...</div>}>
                <WidgetComp />
              </React.Suspense>
            </div>
          );
        })}
      </div>
    </div>
  );
}
