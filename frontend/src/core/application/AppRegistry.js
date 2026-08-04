import React, { lazy, Suspense } from 'react';
import { WorkspaceProvider } from '../workspace/WorkspaceContext';
import AppShell from '../../components/workbench/AppShell';

const GenericAppWrapper = ({ appId, workspaceId, mainPanel: MainPanel }) => {
  return React.createElement(WorkspaceProvider, { appId, defaultWorkspaceId: workspaceId },
    React.createElement(AppShell, {
      mainPanel: (props) => React.createElement(Suspense, { 
        fallback: React.createElement('div', { className: "p-4 text-emerald-500" }, "Loading Module...") 
      }, React.createElement(MainPanel, props))
    })
  );
};

const lazyWithWrapper = (importFunc) => {
  const LazyComponent = lazy(importFunc);
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
