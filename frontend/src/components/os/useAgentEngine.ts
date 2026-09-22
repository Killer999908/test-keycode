'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type AgentStatus = 'idle' | 'planning' | 'thinking' | 'working' | 'done' | 'reviewing';

export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  status: AgentStatus;
  progress: number;
  log: string;
  eta: string;
  color: string;
}

export interface TerminalLine {
  text: string;
  type: 'cmd' | 'info' | 'ok' | 'warn' | 'err' | 'blank';
}

export interface CodeFile {
  name: string;
  language: string;
  code: string;
  lines: number;
}

export type WorkMode = 'idle' | 'home' | 'workbench';

export interface AgentEngine {
  mode: WorkMode;
  bootPhase: 'offline' | 'booting' | 'online';
  prompt: string;
  agents: Agent[];
  terminal: TerminalLine[];
  activeTab: 'preview' | 'code' | 'terminal' | '3d' | 'files' | 'git';
  activeFile: number;
  setActiveTab: (tab: AgentEngine['activeTab']) => void;
  setActiveFile: (idx: number) => void;
  startBuild: (promptText: string) => void;
  reset: () => void;
  generatedFiles: CodeFile[];
  pcb: {
    components: any[];
    netlist: any[];
    pcbSvg: string | null;
    gerberDownload: string | null;
    manufacturingReady: boolean;
    fabricationValidation: any;
    jobId: string | null;
    error: string | null;
  };
}

const AGENT_DEFS: Omit<Agent, 'status' | 'progress' | 'log' | 'eta'>[] = [
  { id: 'planner', name: 'Planner', role: 'Architecture & Roadmap', icon: '◈', color: '#6d7cff' },
  { id: 'researcher', name: 'Researcher', role: 'Market & Tech Research', icon: '◎', color: '#38d6ff' },
  { id: 'frontend', name: 'Frontend Engineer', role: 'UI / UX / Web', icon: '⌬', color: '#9b6dff' },
  { id: 'backend', name: 'Backend Engineer', role: 'APIs & Services', icon: '⚙', color: '#ff5db1' },
  { id: 'database', name: 'Database Engineer', role: 'Schema & Storage', icon: '▦', color: '#34e0a1' },
  { id: 'devops', name: 'DevOps Engineer', role: 'CI/CD & Deploy', icon: '⌁', color: '#ffc46b' },
  { id: 'cad', name: 'CAD Engineer', role: '3D Modelling', icon: '▲', color: '#38d6ff' },
  { id: 'pcb', name: 'PCB Engineer', role: 'Circuit Layout', icon: '⏚', color: '#ff5d6c' },
  { id: 'firmware', name: 'Firmware Engineer', role: 'Embedded Systems', icon: '⚡', color: '#ffc46b' },
  { id: 'game', name: 'Game Developer', role: 'Interactivity & Engines', icon: '✦', color: '#9b6dff' },
  { id: 'ui', name: 'UI Designer', role: 'Visual & Motion', icon: '✳', color: '#ff5db1' },
  { id: 'qa', name: 'QA Tester', role: 'Validation', icon: '✓', color: '#34e0a1' },
  { id: 'security', name: 'Security Auditor', role: 'Hardening', icon: '▣', color: '#6d7cff' },
];

const PLANNING_STEPS = [
  'Analyzing request...',
  'Decomposing into modules...',
  'Selecting architecture...',
  'Assigning agents...',
];

const TERMINAL_SCRIPT: TerminalLine[] = [
  { text: 'KEYCODE-OS v3.0 — orchestration initialized', type: 'info' },
  { text: '> agents spawn --team=full --sync', type: 'cmd' },
  { text: '✓ 13 agents online · planner.delegate()', type: 'ok' },
  { text: 'planning: Parsing intent & constraints', type: 'info' },
  { text: 'planning: architecture → micro-frontend + edge APIs', type: 'info' },
  { text: '> fs mkdir -p ./project/src', type: 'cmd' },
  { text: '✓ directory structure created (38 files)', type: 'ok' },
  { text: 'frontend: bootstrapping Next.js shell', type: 'info' },
  { text: 'frontend: writing components (14/27)...', type: 'info' },
  { text: '> npm install --silent', type: 'cmd' },
  { text: '✓ dependencies installed in 2.4s', type: 'ok' },
  { text: 'backend: generating REST + WebSocket layer', type: 'info' },
  { text: 'backend: auth middleware · rate limits · mux', type: 'info' },
  { text: 'database: designing relational schema v2', type: 'info' },
  { text: 'database: seed data loaded (412 records)', type: 'ok' },
  { text: 'pcb: autorouting 2-layer board · 128 nets', type: 'info' },
  { text: 'pcb: DRC clean · copper pour complete', type: 'ok' },
  { text: 'firmware: flashing bootloader · pins mapped', type: 'info' },
  { text: 'game: importing scene · physics tick 60hz', type: 'info' },
  { text: 'ui: crafting design system tokens', type: 'info' },
  { text: 'ui: motion curves · spacing · glass surfaces', type: 'info' },
  { text: 'qa: running test suite — 42 passing · 0 failing', type: 'ok' },
  { text: 'security: audit complete — 0 critical · 1 advisory', type: 'ok' },
  { text: 'devops: containerizing · pushing registry', type: 'info' },
  { text: 'devops: rolling deploy → production edge', type: 'info' },
  { text: '✓ Deployment completed · https://build.keycode.studio', type: 'ok' },
  { text: '— build summary: 3 min 12 s · 128 files · 6.2 MB', type: 'blank' },
];

const GENERATED_FILES: CodeFile[] = [
  {
    name: 'src/main.tsx',
    language: 'tsx',
    lines: 28,
    code: `import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Engine } from './core/engine';
import { AgentRuntime } from './agents/runtime';

const runtime = new AgentRuntime({
  sync: true,
  team: 'full',
  verbose: process.env.NODE_ENV === 'development',
});

runtime.on('stream', (chunk) => {
  console.log('[gen]', chunk);
});

createRoot(document.getElementById('root')!).render(
  <App engine={runtime.start()} />
);
`,
  },
  {
    name: 'core/engine.ts',
    language: 'ts',
    lines: 41,
    code: `export class Engine {
  private pipeline: Promise<unknown>[] = [];

  constructor(private opts: { parallel: boolean }) {}

  spawn<T>(job: () => Promise<T>): Promise<T> {
    const task = job().then((res) => {
      this.pipeline.push(res);
      return res;
    });
    return this.opts.parallel ? task : this.queue(task);
  }

  private async queue<T>(task: Promise<T>): Promise<T> {
    await this.pipeline.at(-1)?.catch(() => {});
    return task;
  }

  async status(): Promise<{ active: number; done: number }> {
    const settled = await Promise.allSettled(this.pipeline);
    return {
      active: this.pipeline.length - settled.length,
      done: settled.filter((s) => s.status === 'fulfilled').length,
    };
  }
}
`,
  },
  {
    name: 'agents/planner.ts',
    language: 'ts',
    lines: 22,
    code: `import { Agent } from './runtime';

export const planner = new Agent({
  id: 'planner',
  model: 'keycode-plan-v4',
  tools: ['decompose', 'architecture'],
});

export async function planRequest(prompt: string) {
  const outline = await planner.run(prompt);
  return outline.modules.map((m: string) => m.toLowerCase());
}
`,
  },
  {
    name: 'api/health.ts',
    language: 'ts',
    lines: 14,
    code: `import { router } from './router';

router.get('/health', async (c) => {
  return c.json({
    ok: true,
    uptime: process.uptime(),
    agents: await runtime.status(),
  });
});
`,
  },
  {
    name: 'components/Hologram.tsx',
    language: 'tsx',
    lines: 31,
    code: `import { motion } from 'framer-motion';

export function Hologram({ seed }: { seed: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, filter: 'blur(8px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      className="hologram-surface"
      data-seed={seed}
    />
  );
}
`,
  },
  {
    name: 'deploy.yaml',
    language: 'yaml',
    lines: 18,
    code: `name: keycode-build
on:
  push:
    branches: [main]
jobs:
  ship:
    runs-on: keycode-edge
    steps:
      - uses: checkout@v3
      - run: keycode build --production
      - run: keycode deploy --rollout
`,
  },
];

const AGENT_SCRIPTS: Record<string, string[]> = {
  planner: ['Decomposing scope into 12 modules', 'Mapping dependency graph', 'Roadmap: 3 phases defined'],
  researcher: ['Scanning 1,240 sources', 'Benchmarking 14 competitors', 'Insights consolidated'],
  frontend: ['Generating UI primitives', 'Animating with GSAP + R3F', 'Building component tree'],
  backend: ['Drafting API contract v1', 'Implementing auth + rate limits', 'WebSocket gateway online'],
  database: ['Designing relational schema', 'Seeding 412 records', 'Indexing hot queries'],
  devops: ['Writing Dockerfile + compose', 'Pipeline: lint→build→deploy', 'Edge rollout in progress'],
  cad: ['Extruding base geometry', 'Boolean ops on meshes', 'Exporting .stl + .glb'],
  pcb: ['Auto-routing 128 nets', 'Running DRC check', 'Copper pour complete'],
  firmware: ['Mapping pin configuration', 'Flashing bootloader', 'Interrupt handlers wired'],
  game: ['Importing scene graph', 'Physics tick at 60hz', 'Shader pipeline ready'],
  ui: ['Crafting design tokens', 'Motion curves tuned', 'Glass surfaces applied'],
  qa: ['Writing test suite', 'E2E browser matrix', '42 passing · 0 failing'],
  security: ['Static analysis pass', 'Dependency audit', '0 critical findings'],
};

function isPcbRequest(prompt: string): boolean {
  const d = prompt.toLowerCase();
  return /pcb|circuit board|electronics|schematic|gerber|board design|arduino|mcu|firmware|esp32|esp8266|555 timer|led flasher|drone|robotics|embedded/.test(d);
}

export function useAgentEngine() {
  const [mode, setMode] = useState<WorkMode>('idle');
  const [prompt, setPrompt] = useState('');
  const [agents, setAgents] = useState<Agent[]>(() =>
    AGENT_DEFS.map((a) => ({ ...a, status: 'idle', progress: 0, log: 'Standing by', eta: '—' }))
  );
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'terminal' | '3d' | 'files' | 'git'>('terminal');
  const [activeFile, setActiveFile] = useState(0);
  const [bootPhase, setBootPhase] = useState<'offline' | 'booting' | 'online'>('offline');
  const [pcb, setPcb] = useState({
    components: [] as any[],
    netlist: [] as any[],
    pcbSvg: null as string | null,
    gerberDownload: null as string | null,
    manufacturingReady: false,
    fabricationValidation: null as any,
    jobId: null as string | null,
    error: null as string | null,
  });
  const running = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setBootPhase('booting'), 400);
    const t2 = setTimeout(() => setBootPhase('online'), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const addTerminal = useCallback((lines: TerminalLine[]) => {
    setTerminal((prev) => [...prev, ...lines]);
  }, []);

  const startBuild = useCallback((promptText: string) => {
    if (running.current) return;
    running.current = true;
    setPrompt(promptText);
    setMode('workbench');
    setTerminal([]);
    setPcb({
      components: [], netlist: [], pcbSvg: null, gerberDownload: null,
      manufacturingReady: false, fabricationValidation: null, jobId: null, error: null,
    });
    setAgents((prev) => prev.map((a) => ({ ...a, status: 'idle', progress: 0, log: 'Standing by', eta: '—' })));

    if (isPcbRequest(promptText)) {
      const pcbAgent = AGENT_DEFS.find(a => a.id === 'pcb')!;
      setAgents((prev) => prev.map((a) => a.id === 'pcb' ? { ...a, status: 'working', progress: 5, log: 'Initializing PCB stream...', eta: '~1m' } : a));
      addTerminal([{ text: `pcb: streaming real-time PCB generation for: ${promptText}`, type: 'info' }]);

      fetch('/api/ai/stream-pcb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: promptText }),
      }).then(async (response) => {
        if (!response.ok) throw new Error('Stream failed');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader');
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'status') {
                setAgents((prev) => prev.map((a) => {
                  if (a.id !== 'pcb') return a;
                  const progress = Math.min(95, (data.phase + 1) * 20 + Math.random() * 10);
                  return { ...a, status: 'working', progress, log: data.message, eta: `${Math.max(1, 5 - data.phase)}s` };
                }));
                addTerminal([{ text: data.message.replace(/[^\x20-\x7E]/g, ''), type: 'info' }]);
              } else if (data.type === 'components') {
                setPcb((prev) => ({ ...prev, components: data.components, netlist: data.netlist }));
                addTerminal([{ text: `pcb: extracted ${data.components.length} components, ${data.netlist.length} nets`, type: 'ok' }]);
              } else if (data.type === 'placement') {
                addTerminal([{ text: `pcb: placed components (${data.traceCount} traces, ${data.viaCount} vias)`, type: 'info' }]);
              } else if (data.type === 'svg') {
                setPcb((prev) => ({ ...prev, pcbSvg: data.svg }));
                setActiveTab('3d');
              } else if (data.type === 'validation') {
                setPcb((prev) => ({ ...prev, fabricationValidation: data }));
                addTerminal([{ text: `pcb: fabrication validation — ${data.summary}`, type: data.isReady ? 'ok' : 'warn' }]);
              } else if (data.type === 'complete') {
                setPcb((prev) => ({
                  ...prev,
                  jobId: data.jobId,
                  gerberDownload: data.gerberDownload,
                  manufacturingReady: data.manufacturingReady,
                  fabricationValidation: data.fabricationValidation,
                }));
                setAgents((prev) => prev.map((a) => a.id === 'pcb' ? { ...a, status: 'done', progress: 100, log: data.manufacturingReady ? 'Fabrication ready!' : 'Complete (preview)', eta: 'done' } : a));
                addTerminal([{ text: data.manufacturingNote?.replace(/[^\x20-\x7E]/g, '') || 'PCB generation complete', type: data.manufacturingReady ? 'ok' : 'warn' }]);
                running.current = false;
              } else if (data.type === 'error') {
                setPcb((prev) => ({ ...prev, error: data.message }));
                setAgents((prev) => prev.map((a) => a.id === 'pcb' ? { ...a, status: 'reviewing', log: 'Error: ' + data.message, eta: '—' } : a));
                addTerminal([{ text: `pcb error: ${data.message}`, type: 'err' }]);
                running.current = false;
              }
            } catch (e) { /* skip invalid JSON */ }
          }
        }
      }).catch((err) => {
        setPcb((prev) => ({ ...prev, error: err.message }));
        setAgents((prev) => prev.map((a) => a.id === 'pcb' ? { ...a, status: 'reviewing', log: 'Stream error', eta: '—' } : a));
        running.current = false;
      });

      return;
    }

    // Non-PCB: original simulated flow
    let step = 0;
    const planning = setInterval(() => {
      if (step < PLANNING_STEPS.length) {
        addTerminal([{ text: `planning: ${PLANNING_STEPS[step]}`, type: 'info' }]);
        setAgents((prev) =>
          prev.map((a, i) =>
            i === 0 ? { ...a, status: 'thinking', log: PLANNING_STEPS[step], progress: step * 12, eta: `${3 - step}m` } : a
          )
        );
        step++;
      } else {
        clearInterval(planning);
        setAgents((prev) =>
          prev.map((a) => (a.id === 'planner' ? { ...a, status: 'done', progress: 100, log: 'Plan approved', eta: 'done' } : a))
        );
        addTerminal([{ text: '✓ Roadmap approved by planner', type: 'ok' }]);
        runAgents();
      }
    }, 800);
  }, [addTerminal]);

  const runAgents = useCallback(() => {
    let lineIdx = 1;
    const termStream = setInterval(() => {
      if (lineIdx < TERMINAL_SCRIPT.length) {
        addTerminal([TERMINAL_SCRIPT[lineIdx]]);
        lineIdx++;
      } else {
        clearInterval(termStream);
      }
    }, 420);

    const agentsToRun = AGENT_DEFS.filter((a) => a.id !== 'planner');
    agentsToRun.forEach((def, orderIdx) => {
      const delay = 1500 + orderIdx * 900;
      setTimeout(() => {
        setAgents((prev) =>
          prev.map((a) => (a.id === def.id ? { ...a, status: 'working', progress: 8, log: 'Starting…', eta: '~2m' } : a))
        );

        const script = AGENT_SCRIPTS[def.id] ?? [];
        let sIdx = 0;
        const progressInterval = setInterval(() => {
          setAgents((prev) =>
            prev.map((a) => {
              if (a.id !== def.id) return a;
              const newProg = Math.min(100, a.progress + 5 + Math.random() * 9);
              const log = sIdx < script.length ? script[sIdx] : a.log;
              return {
                ...a,
                progress: newProg,
                log,
                status: newProg >= 100 ? 'done' : 'working',
                eta: newProg >= 100 ? 'done' : `${Math.ceil((100 - newProg) / 6)}s`,
              };
            })
          );
          sIdx = Math.min(sIdx + 1, script.length - 1);
          if (Math.random() > 0.5) sIdx = Math.min(sIdx + 1, script.length - 1);
        }, 480);
        setTimeout(() => clearInterval(progressInterval), 10000 + Math.random() * 6000);
      }, delay);
    });
  }, [addTerminal]);

  const reset = useCallback(() => {
    running.current = false;
    setMode('home');
    setPrompt('');
    setAgents((prev) => prev.map((a) => ({ ...a, status: 'idle', progress: 0, log: 'Standing by', eta: '—' })));
    setTerminal([]);
    setPcb({
      components: [], netlist: [], pcbSvg: null, gerberDownload: null,
      manufacturingReady: false, fabricationValidation: null, jobId: null, error: null,
    });
  }, []);

  return {
    mode,
    bootPhase,
    prompt,
    agents,
    terminal,
    activeTab,
    activeFile,
    setActiveTab,
    setActiveFile,
    startBuild,
    reset,
    generatedFiles: GENERATED_FILES,
    pcb,
  };
}
