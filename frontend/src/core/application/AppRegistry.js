import React, { lazy, Suspense } from 'react';
import { WorkspaceProvider } from '../workspace/WorkspaceContext';
import AppShell from '../../components/workbench/AppShell';

// [FIX: Unmount Loop] Komponen pembungkus Suspense yang STATIS.
// Definisi di luar GenericAppWrapper agar referensi tipe komponen tidak berubah
// di setiap siklus render parent. Jika fungsi komponen dibuat inline di dalam
// GenericAppWrapper, React Reconciler mendeteksi "tipe baru" di setiap render
// dan secara paksa meng-UNMOUNT seluruh sub-tree (ConversationEngine + state chat).
// Dengan komponen statis ini, React mempertahankan instance yang sama → 0 Unmount.
const ModuleSuspenseWrapper = React.memo(function ModuleSuspenseWrapper({ component: Component, ...props }) {
  return React.createElement(
    Suspense,
    { fallback: React.createElement('div', { className: 'p-4 text-emerald-500 font-mono text-xs' }, 'Loading Module...') },
    React.createElement(Component, props)
  );
});

const GenericAppWrapper = ({ appId, workspaceId, mainPanel: MainPanel }) => {
  // [FIX: Unmount Loop] useRef menyimpan referensi fungsi mainPanel secara persisten
  // sepanjang lifetime instance komponen ini. Karena `MainPanel` (LazyComponent) adalah
  // referensi stabil dari `lazyWithWrapper`, fungsi di dalam ref ini tidak pernah berubah.
  // AppShell akan menerima referensi fungsi yang IDENTIK di setiap re-render parent,
  // sehingga React Reconciler tidak pernah mendeteksi "tipe baru" → 0 Unmount.
  const mainPanelRef = React.useRef(null);
  if (!mainPanelRef.current) {
    mainPanelRef.current = (props) => React.createElement(ModuleSuspenseWrapper, { component: MainPanel, ...props });
  }

  return React.createElement(WorkspaceProvider, { appId, defaultWorkspaceId: workspaceId },
    React.createElement(AppShell, { mainPanel: mainPanelRef.current })
  );
};

const lazyWithWrapper = (importFunc) => {
  const LazyComponent = lazy(importFunc);
  // Buat satu instance komponen wrapper per definisi app — referensi stabil sepanjang lifetime.
  return (props) => React.createElement(GenericAppWrapper, { ...props, mainPanel: LazyComponent });
};

export const AppComponents = {
  // Apps
  'HomeDashboard': lazy(() => import('../../components/dashboard/HomeDashboard')),
  'ConversationEngine': lazyWithWrapper(() => import('../../components/workbench/ConversationEngine')),
  'AgentForge': lazy(() => import('../../components/agent-forge/AgentForge')),
  'ResearchApp': lazy(() => import('../../components/research/ResearchApp')),
  'MemoryApp': lazy(() => import('../../components/memory/MemoryApp')),
  'FileExplorer': lazy(() => import('../../components/explorer/FileExplorer')),
  'Settings': lazy(() => import('../../components/Settings')),
  
  // Widgets
  'WorkspaceOverviewWidget': lazy(() => import('../../components/dashboard/widgets/WorkspaceOverviewWidget')),
  'SystemStatusWidget': lazy(() => import('../../components/dashboard/widgets/SystemStatusWidget')),
  'CurrentActivityWidget': lazy(() => import('../../components/dashboard/widgets/CurrentActivityWidget')),
  'RecentEventsWidget': lazy(() => import('../../components/dashboard/widgets/RecentEventsWidget')),
  'PendingApprovalWidget': lazy(() => import('../../components/dashboard/widgets/PendingApprovalWidget')),
  'VerificationSummaryWidget': lazy(() => import('../../components/dashboard/widgets/VerificationSummaryWidget')),
  'QuickActionsWidget': lazy(() => import('../../components/dashboard/widgets/QuickActionsWidget')),
  
  // Engineer Widgets
  'EngineeringTasksWidget': lazy(() => import('../../components/widgets/EngineeringTasksWidget')),
  'ArchitectureGapsWidget': lazy(() => import('../../components/widgets/ArchitectureGapsWidget')),
  'VerificationLogWidget': lazy(() => import('../../components/widgets/VerificationLogWidget')),
  'WorkspaceNavWidget': lazy(() => import('../../components/widgets/WorkspaceNavWidget')),
  'MaefExecutionMonitorWidget': lazy(() => import('../../components/widgets/MaefExecutionMonitorWidget')),
  'DisasterRecoveryWidget': lazy(() => import('../../components/widgets/DisasterRecoveryWidget'))
};
