'use client';

import { motion } from 'framer-motion';
import type { Agent } from './useAgentEngine';

const STATUS_LABEL: Record<Agent['status'], string> = {
  idle: 'Standby',
  planning: 'Planning',
  thinking: 'Thinking',
  working: 'Working',
  done: 'Complete',
  reviewing: 'Reviewing',
};

export default function AgentGrid({ agents }: { agents: Agent[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
      {agents.map((agent, i) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="os-panel os-panel-hover p-3 relative overflow-hidden"
        >
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${agent.color}66, transparent)`,
              opacity: agent.status === 'idle' ? 0.15 : 0.8,
            }}
          />
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-sm"
              style={{ background: `${agent.color}1a`, border: `1px solid ${agent.color}40`, color: agent.color }}
            >
              {agent.icon}
              {(agent.status === 'working' || agent.status === 'thinking' || agent.status === 'planning') && (
                <span
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full os-live-dot"
                  style={{ background: agent.color, boxShadow: `0 0 8px ${agent.color}` }}
                />
              )}
              {agent.status === 'done' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--os-green)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-white font-medium leading-tight truncate">{agent.name}</div>
              <div className="text-[10px] text-[var(--os-text-faint)] truncate">{agent.role}</div>
            </div>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{
                color: agent.status === 'done' ? 'var(--os-green)' : agent.status === 'idle' ? 'var(--os-text-faint)' : agent.color,
                background: agent.status === 'idle' ? 'rgba(255,255,255,0.03)' : `${agent.color}14`,
              }}
            >
              {STATUS_LABEL[agent.status]}
            </span>
          </div>

          <div className="h-[3px] rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden mb-1.5">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${agent.color}, ${agent.color}88)` }}
              animate={{ width: `${agent.progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--os-text-dim)] truncate pr-1">{agent.log}</span>
            <span className="text-[10px] font-mono text-[var(--os-text-faint)] shrink-0">{agent.eta}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
