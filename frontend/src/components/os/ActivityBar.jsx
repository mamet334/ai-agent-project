import React from 'react';
import { MessageSquare, Terminal, Database, FlaskConical, Settings } from 'lucide-react';

const ActivityIcon = ({ icon, active, tooltip }) => (
  <div 
    className={`relative flex items-center justify-center w-full h-12 cursor-pointer transition-colors group
      ${active ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
    title={tooltip}
  >
    {active && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />}
    {icon}
  </div>
);

export default function ActivityBar() {
  return (
    <div className="w-14 h-full bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 shrink-0 z-50">
      <div className="flex flex-col gap-4 w-full items-center">
        <ActivityIcon icon={<MessageSquare size={24} strokeWidth={1.5} />} active tooltip="Assistant" />
        <ActivityIcon icon={<Terminal size={24} strokeWidth={1.5} />} tooltip="Engineer" />
        <ActivityIcon icon={<Database size={24} strokeWidth={1.5} />} tooltip="Memory" />
        <ActivityIcon icon={<FlaskConical size={24} strokeWidth={1.5} />} tooltip="Research" />
      </div>
      <div className="mt-auto flex flex-col gap-4 w-full items-center">
        <ActivityIcon icon={<Settings size={24} strokeWidth={1.5} />} tooltip="Settings" />
      </div>
    </div>
  );
}
