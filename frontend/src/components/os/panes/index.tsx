'use client';

import type { ComponentType } from 'react';
import type { AgentEngine } from '../useAgentEngine';
import DashboardPane from './DashboardPane';
import ProjectsPane from './ProjectsPane';
import AiChatPane from './AiChatPane';
import BuilderPane from './BuilderPane';
import TerminalPane from './TerminalPane';
import DeploymentsPane from './DeploymentsPane';
import MemoryPane from './MemoryPane';
import MarketplacePane from './MarketplacePane';
import TeamPane from './TeamPane';
import AnalyticsPane from './AnalyticsPane';
import SettingsPane from './SettingsPane';

/**
 * Registry: sidebar nav id → main-stage pane.
 * Anything not listed falls through to a PlaceholderPane via OsRoot.
 */
export const PANES: Record<string, ComponentType<{ engine: AgentEngine }>> = {
  dashboard: DashboardPane,
  projects: ProjectsPane,
  'ai-chat': AiChatPane,
  web: ({ engine }) => <BuilderPane kind="web" engine={engine} />,
  cad: ({ engine }) => <BuilderPane kind="cad" engine={engine} />,
  pcb: ({ engine }) => <BuilderPane kind="pcb" engine={engine} />,
  game: ({ engine }) => <BuilderPane kind="game" engine={engine} />,
  terminal: TerminalPane,
  deploy: DeploymentsPane,
  marketplace: MarketplacePane,
  team: TeamPane,
  analytics: AnalyticsPane,
  memory: MemoryPane,
  settings: SettingsPane,
};

/** Nav ids that have no real pane yet — shown as "on the roadmap". */
export const PLACEHOLDER_NAV: Record<string, { label: string; icon: string }> = {};
