import React from 'react';
import Sidebar from './Sidebar';
import ApplicationContainer from './ApplicationContainer';

export default function OSDesktopShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-surface font-body-base selection:bg-primary/30">
      <Sidebar />
      <ApplicationContainer />
    </div>
  );
}
