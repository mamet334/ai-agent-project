import React, { useEffect, useState } from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';

export default function RecentEventsWidget() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');
    
    const listeners = [];
    const namespaces = ['System:Ready', 'Memory:Stored', 'Agent:ExecutionComplete', 'Verification:Completed', 'Intent:Received'];
    
    namespaces.forEach(ns => {
      const unsub = eventBus.on(ns, (payload) => {
        setEvents(prev => {
          const newEvents = [{
            time: new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second:'2-digit' }),
            event: ns,
            source: payload.source || 'Kernel',
            status: 'Success'
          }, ...prev].slice(0, 5);
          return newEvents;
        });
      });
      listeners.push({ ns, unsub });
    });

    return () => {
      listeners.forEach(({ ns, unsub }) => eventBus.off(ns, unsub));
    };
  }, []);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-xs text-slate-300">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500">
            <th className="pb-2 font-medium">Timestamp</th>
            <th className="pb-2 font-medium">Event</th>
            <th className="pb-2 font-medium">Source</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan="4" className="py-4 text-center text-slate-500">No recent events captured</td>
            </tr>
          ) : (
            events.map((e, idx) => (
              <tr key={idx} className="border-b border-slate-800/30">
                <td className="py-2">{e.time}</td>
                <td className="py-2 text-emerald-400">{e.event}</td>
                <td className="py-2 text-blue-400">{e.source}</td>
                <td className="py-2">
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-[10px]">
                    {e.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
