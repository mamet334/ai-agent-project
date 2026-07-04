import React from 'react';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import ApplicationContainer from './ApplicationContainer';

export default function OSDesktopShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-200 font-sans">
      <ActivityBar />
      <Sidebar />
      <ApplicationContainer />
    </div>
  );
}
