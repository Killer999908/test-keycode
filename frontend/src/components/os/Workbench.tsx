'use client';

import { motion } from 'framer-motion';
import type { AgentEngine } from './useAgentEngine';
import AgentGrid from './AgentGrid';
import TerminalPane from './TerminalPane';
import CodePane from './CodePane';
import PreviewPane from './PreviewPane';
import Viewer3DPane from './Viewer3DPane';

const TABS: { id: AgentEngine['activeTab']; label: string; icon: string }[] = [
  { id: 'terminal', label: 'Terminal', icon: '⌁' },
  { id: 'preview', label: 'Preview', icon: '▣' },
  { id: 'code', label: 'Code', icon: '⌬' },
  { id: '3d', label: '3D Viewer', icon: '▲' },
  { id: 'files', label: 'Files', icon: '▤' },
  { id: 'git', label: 'Git', icon: '⧉' },
];

export default function Workbench({ engine }: { engine: AgentEngine }) {
  const { agents, terminal, activeTab, setActiveTab, generatedFiles, activeFile, setActiveFile, prompt } = engine;
  const doneCount = agents.filter((a) => a.status === 'done').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-10 h-screen pt-11 pl-[216px]"
    >
      <div className="h-full p-3 flex flex-col gap-3">
        {/* Build header */}
        <div className="os-panel px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--os-text-faint)]">Active build</div>
            <div className="text-white font-medium truncate text-sm mt-0.5">{prompt}</div>
          </div>
          <div className="flex items-center gap-5 text-[11px] font-mono">
            <span className="text-[var(--os-text-dim)]">
              agents <span className="text-[var(--os-green)]">{doneCount}</span>/{agents.length}
            </span>
            <span className="text-[var(--os-text-dim)]">
              files <span className="text-[var(--os-accent-3)]">128</span>
            </span>
            <span className="text-[var(--os-text-dim)]">
              <span className="os-live-dot inline-block mr-1.5" />
              streaming
            </span>
            <button onClick={engine.reset} className="os-btn text-[12px] px-3 py-1">
              New build
            </button>
          </div>
        </div>

        {/* Split: agents + conversation / live generation */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-3 min-h-0">
          {/* Left: agents + conversation */}
          <div className="flex flex-col gap-3 min-h-0">
            <div className="os-panel flex-1 overflow-y-auto os-scrollbar p-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--os-text-faint)]">Agent Team</span>
                <span className="text-[10px] font-mono text-[var(--os-text-faint)]">
                  {doneCount === agents.length ? 'all systems nominal' : 'orchestrating…'}
                </span>
              </div>
              <AgentGrid agents={agents} />
            </div>

            <div className="os-panel h-48 shrink-0 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-[var(--os-border)] text-[10px] uppercase tracking-[0.3em] text-[var(--os-text-faint)]">
                Conversation
              </div>
              <div className="flex-1 overflow-y-auto os-scrollbar p-3 space-y-2.5">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2 text-[13px] text-white" style={{ background: 'linear-gradient(120deg, #6d7cff, #9b6dff)' }}>
                    {prompt}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2 text-[13px] text-[var(--os-text)] bg-[rgba(255,255,255,0.05)]">
                    <span className="text-[var(--os-accent)] mr-1.5">◆</span>
                    Acknowledged. Assembling a full team to build this. Watching live: design, code, hardware & deployment.
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2 text-[13px] text-[var(--os-text-dim)] bg-[rgba(255,255,255,0.03)]">
                    <span className="os-live-dot inline-block mr-2" />
                    {doneCount === agents.length ? 'Build complete. Preview ready.' : `Streaming work from ${Math.min(agents.length, doneCount + 1)} agents…`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: live generation tabs */}
          <div className="os-panel flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-1 px-2 pt-1.5 border-b border-[var(--os-border)]">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[11.5px] rounded-t-lg transition-colors ${
                    activeTab === tab.id
                      ? 'text-white bg-[rgba(255,255,255,0.04)] border-b border-[var(--os-accent)]'
                      : 'text-[var(--os-text-faint)] hover:text-[var(--os-text-dim)]'
                  }`}
                >
                  <span className="text-[var(--os-accent)]/70">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1.5 pr-2 text-[10px] font-mono text-[var(--os-text-faint)]">
                <span className="os-live-dot" /> keycode.build
              </span>
            </div>
            <div className="flex-1 min-h-0">
              {activeTab === 'terminal' && <TerminalPane lines={terminal} />}
              {activeTab === 'preview' && <PreviewPane prompt={prompt} agents={agents} />}
              {activeTab === 'code' && (
                <CodePane files={generatedFiles} activeFile={activeFile} onSelectFile={setActiveFile} />
              )}
              {activeTab === '3d' && <Viewer3DPane type={prompt.toLowerCase().includes('pcb') ? 'pcb' : prompt.toLowerCase().includes('game') ? 'game' : 'cad'} pcb={engine.pcb} />}
              {activeTab === 'files' && (
                <div className="h-full overflow-y-auto os-scrollbar p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--os-text-faint)] mb-3">Generated files</div>
                  <div className="space-y-1 font-mono text-[12.5px]">
                    {['project/src/main.tsx', 'project/core/engine.ts', 'project/agents/planner.ts', 'project/api/health.ts', 'project/components/Hologram.tsx', 'project/deploy.yaml', 'project/README.md', 'project/tsconfig.json', 'project/package.json', 'project/.env.example'].map((f, i) => (
                      <div
                        key={f}
                        className="os-rise flex items-center gap-2 px-2 py-1 rounded hover:bg-[rgba(255,255,255,0.03)] cursor-pointer text-[var(--os-text-dim)] hover:text-white"
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <span className="text-[var(--os-accent)]/60">{f.endsWith('/') ? '▸' : '▤'}</span>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'git' && (
                <div className="h-full overflow-y-auto os-scrollbar p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--os-text-faint)] mb-3">Commit history</div>
                  <div className="space-y-2 font-mono text-[12px]">
                    {[
                      { hash: 'a91f2c1', msg: 'feat: complete build pipeline', time: 'just now' },
                      { hash: '7d0ae93', msg: 'feat: render hologram preview', time: '2 min ago' },
                      { hash: 'b3f9c11', msg: 'feat: add firmware bootloader', time: '4 min ago' },
                      { hash: 'e2a5d77', msg: 'feat: autoroute pcb nets', time: '6 min ago' },
                      { hash: 'c1b9d04', msg: 'init: scaffold project', time: '8 min ago' },
                    ].map((c, i) => (
                      <div key={c.hash} className="os-rise flex items-center gap-3" style={{ animationDelay: `${i * 0.06}s` }}>
                        <span className="text-[var(--os-amber)]">{c.hash}</span>
                        <span className="text-[var(--os-text-dim)]">{c.msg}</span>
                        <span className="ml-auto text-[var(--os-text-faint)]">{c.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
