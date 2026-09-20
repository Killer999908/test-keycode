// Task routing helpers — shared by /api/ai/task-router fast & full paths.
// Kept side-effect-free so it can be unit-tested in isolation.

const TOOL_PATTERNS = [
  // quantum must precede pcb: "quantum circuit" is not a PCB request
  ['quantum', /quantum|qubit/],
  ['pcb', /pcb|circuit|schematic|gerber/],
  ['cad', /cad|stl|enclosure|3d model/],
  ['game', /game|fortnite|racing|shooter/],
  ['firmware', /firmware|arduino|esp32|mcu|robot|ros/],
  ['video', /video|mp4/],
];

const AGENTS_BY_TOOL = {
  pcb: ['Core', 'Builder', 'Designer', 'QA'],
  cad: ['Core', 'Builder', 'Designer', 'QA'],
  game: ['Core', 'Builder', 'Designer', 'QA', 'Scout'],
  firmware: ['Core', 'Builder', 'QA'],
  video: ['Core', 'Builder', 'QA'],
  quantum: ['Core', 'Builder', 'QA'],
  website: ['Core', 'Builder', 'Designer', 'QA', 'Scout', 'Sweeper'],
};

export function detectTool(text) {
  const d = String(text || '').toLowerCase();
  for (const [tool, re] of TOOL_PATTERNS) {
    if (re.test(d)) return tool;
  }
  return 'website';
}

export function agentsForTool(tool) {
  return AGENTS_BY_TOOL[tool] || AGENTS_BY_TOOL.website;
}
