import React, { lazy, Suspense } from 'react';
import { WorkspaceProvider } from '../workspace/WorkspaceContext';
import AppShell from '../../components/workbench/AppShell';

const GenericAppWrapper = ({ appId, workspaceId, mainPanel: MainPanel }) => {
  return React.createElement(WorkspaceProvider, { appId, defaultWorkspaceId: workspaceId },
    React.createElement(AppShell, {
      mainPanel: React.createElement(Suspense, { 
        fallback: React.createElement('div', { className: "p-4 text-emerald-500" }, "Loading Module...") 
      }, React.createElement(MainPanel))
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
  'AgentForge': lazyWithWrapper(() => import('../../components/agent-forge/AgentForge')),
  'ResearchApp': lazyWithWrapper(() => import('../../components/research/ResearchApp')),
  'MemoryApp': lazyWithWrapper(() => import('../../components/memory/MemoryApp')),
  'Settings': lazy(() => import('../../components/Settings')),
  
  // Widgets
  'WorkspaceOverviewWidget': lazy(() => import('../../components/dashboard/widgets/WorkspaceOverviewWidget')),
  'SystemStatusWidget': lazy(() => import('../../components/dashboard/widgets/SystemStatusWidget')),
  'CurrentActivityWidget': lazy(() => import('../../components/dashboard/widgets/CurrentActivityWidget')),
  'RecentEventsWidget': lazy(() => import('../../components/dashboard/widgets/RecentEventsWidget')),
  'PendingApprovalWidget': lazy(() => import('../../components/dashboard/widgets/PendingApprovalWidget')),
  'VerificationSummaryWidget': lazy(() => import('../../components/dashboard/widgets/VerificationSummaryWidget')),
  'QuickActionsWidget': lazy(() => import('../../components/dashboard/widgets/QuickActionsWidget'))
};
