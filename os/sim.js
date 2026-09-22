/* ============================================================
   KEYCODE OS — Project Simulation Engine
   Detects the project domain from a prompt and produces a
   realistic build script: agents, files, code, terminal, DB,
   git, deployment, and a live preview.
   ============================================================ */

export const AGENT_DEFS = [
  { id: 'planner', name: 'Planner', role: 'Architecture & specs', icon: '◈', color: '#a78bfa', domain: 'all' },
  { id: 'researcher', name: 'Researcher', role: 'Market & tech research', icon: '⌕', color: '#22d3ee', domain: 'all' },
  { id: 'frontend', name: 'Frontend Engineer', role: 'UI · React · CSS', icon: '⬡', color: '#6d5cff', domain: 'web' },
  { id: 'backend', name: 'Backend Engineer', role: 'APIs · services', icon: '◫', color: '#f59e0b', domain: 'web' },
  { id: 'database', name: 'Database Engineer', role: 'Schema · queries', icon: '▤', color: '#34d399', domain: 'web' },
  { id: 'devops', name: 'DevOps', role: 'Build · deploy', icon: '⇪', color: '#fb7185', domain: 'all' },
  { id: 'cad', name: 'CAD Engineer', role: '3D modeling', icon: '⬢', color: '#60a5fa', domain: 'cad' },
  { id: 'pcb', name: 'PCB Engineer', role: 'Schematic · layout', icon: '⊞', color: '#f472b6', domain: 'pcb' },
  { id: 'firmware', name: 'Firmware Engineer', role: 'Embedded code', icon: '◉', color: '#fb923c', domain: 'pcb' },
  { id: 'game', name: 'Game Developer', role: 'Engine · gameplay', icon: '▶', color: '#c084fc', domain: 'game' },
  { id: 'uidesigner', name: 'UI Designer', role: 'Visual language', icon: '✦', color: '#2dd4bf', domain: 'web' },
  { id: 'qa', name: 'QA Tester', role: 'Verification', icon: '✓', color: '#a3e635', domain: 'all' },
  { id: 'security', name: 'Security Auditor', role: 'Hardening', icon: '◉', color: '#f87171', domain: 'web' },
];

function detectDomain(prompt) {
  const p = prompt.toLowerCase();
  // CAD first: "skateboard" also contains "board" which would mis-hit PCB
  if (/(skateboard|cad\b|3d model|3d print|mechanical|enclosure|architecture|industrial design|product design)/.test(p)) return 'cad';
  if (/(pcb\b|circuit|drone|flight controller|schematic|microcontroller|\bfirmware\b|hardware board|eletronic|embedded)/.test(p)) return 'pcb';
  if (/(game|unreal|unity\b|gameplay|playable|engine\b)/.test(p)) return 'game';
  if (/(erp|inventory|billing|sap|enterprise system|business management)/.test(p)) return 'erp';
  return 'web';
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-project';
}

function pickActiveAgents(domain) {
  const always = ['planner', 'researcher', 'devops', 'qa'];
  const domains = {
    web: ['frontend', 'backend', 'database', 'uidesigner', 'security'],
    cad: ['cad'],
    pcb: ['pcb', 'firmware'],
    game: ['game', 'frontend'],
    erp: ['frontend', 'backend', 'database', 'security'],
  };
  const extra = domains[domain] || domains.web;
  return always.concat(extra).map((id) => AGENT_DEFS.find((a) => a.id === id));
}

/* ---------------- Project builders ---------------- */

function buildWebProject(prompt) {
  const name = slugify(prompt.split(' ').slice(0, 4).join(' '));
  const title = prompt.split('\n')[0].trim() || 'Generated App';
  return {
    domain: 'web',
    name,
    previewTitle: title,
    tree: {
      'src': {
        'index.html': { icon: '🌐', size: '3.2 KB' },
        'app.js': { icon: '🟨', size: '2.1 KB' },
        'styles.css': { icon: '🎨', size: '4.4 KB' },
        'components': {
          'Navbar.jsx': { icon: '⚛️', size: '1.4 KB' },
          'Hero.jsx': { icon: '⚛️', size: '1.1 KB' },
          'Dashboard.jsx': { icon: '⚛️', size: '2.6 KB' },
        },
      },
      'server': {
        'api.js': { icon: '🟩', size: '3.8 KB' },
        'routes.js': { icon: '🟩', size: '2.2 KB' },
      },
      'config': {
        'package.json': { icon: '📦', size: '0.8 KB' },
        'vite.config.js': { icon: '⚙️', size: '0.5 KB' },
      },
      'README.md': { icon: '📘', size: '1.2 KB' },
    },
    code: {
      'src/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="nav">
    <div class="logo">KEYCODE</div>
    <nav>
      <a href="#home">Home</a>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <button class="cta">Get started</button>
    </nav>
  </header>

  <section id="home" class="hero">
    <h1>${title}</h1>
    <p>Built live by the KEYCODE AI team.</p>
    <button class="cta primary" id="cta">Launch →</button>
    <div class="stats" id="stats"></div>
  </section>

  <section id="features" class="grid">
    <div class="card">Fast</div>
    <div class="card">Scalable</div>
    <div class="card">Beautiful</div>
    <div class="card">AI-native</div>
  </section>

  <footer>© ${new Date().getFullYear()} ${title}</footer>
  <script src="app.js"></script>
</body>
</html>`,
      'src/app.js': `// Live-rendered by KEYCODE OS
const $ = (s) => document.querySelector(s);

const stats = ['99.9% uptime', '12 agents', '0 human edits'];
$('#stats').innerHTML = stats
  .map((s) => '<div class="stat">' + s + '</div>')
  .join('');

$('#cta').addEventListener('click', () => {
  alert('Deployed 🚀');
});

console.log('KEYCODE OS — app booted');`,
      'src/styles.css': `/* Generated by KEYCODE OS */
:root {
  --bg: #0a0a12;
  --fg: #eef2ff;
  --acc: #6d5cff;
  --acc2: #22d3ee;
}
* { margin: 0; box-sizing: border-box; font-family: system-ui; }
body { background: var(--bg); color: var(--fg); }
.nav {
  display: flex; justify-content: space-between;
  align-items: center; padding: 18px 40px;
  position: sticky; top: 0; backdrop-filter: blur(10px);
}
.nav .logo { font-weight: 800; letter-spacing: 0.2em; }
.nav nav { display: flex; gap: 24px; align-items: center; }
.nav a { color: #9aa4c4; text-decoration: none; }
.nav a:hover { color: #fff; }
.cta {
  border: none; padding: 10px 20px; border-radius: 10px;
  background: var(--acc); color: #fff; cursor: pointer;
  font-weight: 600; transition: transform .2s;
}
.cta:hover { transform: translateY(-2px); }
.cta.primary { background: linear-gradient(135deg, var(--acc), var(--acc2)); }
.hero { text-align: center; padding: 120px 24px 80px; }
.hero h1 {
  font-size: clamp(38px, 7vw, 72px);
  background: linear-gradient(180deg, #fff, #8b94c8);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero p { color: #9aa4c4; margin: 18px 0 28px; font-size: 18px; }
.stats { display: flex; gap: 18px; justify-content: center; margin-top: 44px; }
.stat {
  padding: 14px 22px; border-radius: 14px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
}
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 20px; padding: 60px 40px; max-width: 1100px; margin: 0 auto; }
.card {
  padding: 40px 24px; border-radius: 16px; text-align: center;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
}
footer { text-align: center; color: #5a648a; padding: 40px; }`,
    },
    terminal: [
      ['info', '⚡ Initializing build for "' + title + '"'],
      ['ok', '✔ Resolved project domain: web application'],
      ['ok', '✔ Architecture: React + Node + MongoDB'],
      ['info', '▶ scaffolding project structure…'],
      ['ok', '✔ created src/ components/ server/ config/'],
      ['info', '▶ installing dependencies…'],
      ['ok', '✔ 128 packages installed in 4.2s'],
      ['info', '▶ generating frontend…'],
      ['ok', '✔ <span class="t-warn">main.tsx</span> written'],
      ['info', '▶ generating backend APIs…'],
      ['ok', '✔ 14 REST endpoints created'],
      ['info', '▶ writing unit tests…'],
      ['ok', '✔ 26 tests · 26 passing'],
      ['info', '▶ running security audit…'],
      ['ok', '✔ 0 vulnerabilities'],
      ['info', '▶ optimizing bundle…'],
      ['ok', '✔ gzip 128 KB · tree-shaken'],
      ['info', '▶ deploying preview environment…'],
      ['ok', '✔ Deployed → https://' + name + '.keycode.preview'],
    ],
    dbTables: [
      { name: 'users', rows: [['id', 'ObjectId'], ['email', 'String'], ['role', 'String'], ['createdAt', 'Date']] },
      { name: 'projects', rows: [['id', 'ObjectId'], ['owner', 'Ref<users>'], ['status', 'String'], ['files', 'Number']] },
      { name: 'sessions', rows: [['token', 'String'], ['user', 'Ref<users>'], ['expires', 'Date']] },
    ],
    git: [
      ['feat: scaffold project from prompt', 'a3f9c1d'],
      ['feat: build responsive UI system', 'b7e42aa'],
      ['feat: add API layer + validation', 'f19d2be'],
      ['test: add unit + e2e suites', '4ca20ef'],
      ['chore: optimize bundle size', 'e8b11c3'],
      ['feat: security hardening (CORS, CSP)', '9d3f66a'],
    ],
    deploy: ['Provisioning sandbox', 'Building assets', 'Running migrations', 'Starting service', 'Health check passed', 'Live URL assigned'],
    agents: [
      ['planner', 'Architecture finalized — 6 modules'],
      ['researcher', 'Benchmarked 3 comparable products'],
      ['uidesigner', 'Design tokens: glass + violet/cyan'],
      ['frontend', 'Building Navbar component'],
      ['frontend', 'Composing hero + stats section'],
      ['backend', 'Auth routes complete'],
      ['backend', 'REST API wired to MongoDB'],
      ['database', '3 collections · indexes created'],
      ['security', 'CSP + CORS policies applied'],
      ['qa', 'Unit suite green (26/26)'],
      ['devops', 'Preview build shipped'],
    ],
    previewSrc: null,
  };
}

function buildPcbProject(prompt) {
  const name = slugify(prompt.split(' ').slice(0, 4).join(' '));
  const title = prompt.split('\n')[0].trim() || 'Drone PCB';
  return {
    domain: 'pcb',
    name,
    previewTitle: title,
    tree: {
      'hardware': {
        'schematic.sch': { icon: '⊞', size: '14.2 KB' },
        'board.brd': { icon: '▤', size: '18.6 KB' },
        'BOM.csv': { icon: '📄', size: '2.4 KB' },
      },
      'firmware': {
        'main.c': { icon: '◉', size: '6.1 KB' },
        'imu.c': { icon: '◉', size: '3.3 KB' },
        'pid.c': { icon: '◉', size: '2.8 KB' },
        'Makefile': { icon: '⚙️', size: '0.6 KB' },
      },
      'docs': {
        'README.md': { icon: '📘', size: '1.6 KB' },
        'assembly.md': { icon: '📘', size: '2.2 KB' },
      },
    },
    code: {
      'firmware/main.c': `// Drone flight controller — auto-generated by KEYCODE OS
#include <stdio.h>
#include "imu.h"
#include "pid.h"

static float target_alt = 1.5f;   // meters
static float target_yaw = 0.0f;   // radians

int main(void) {
  // Init hardware
  imu_init(IMU_MPU6050, I2C_BUS_1);
  pid_init(&alt_pid, 1.2f, 0.05f, 0.3f, target_alt);
  pid_init(&yaw_pid, 0.8f, 0.01f, 0.1f, target_yaw);

  while (1) {
    imu_read(&accel, &gyro, &temp);
    float alt = fused_altitude(accel);
    float out = pid_update(&alt_pid, alt, dt);
    motor_write(0, clamp(out, -1.0f, 1.0f));
    delay_ms(4);
  }
  return 0;
}`,
      'firmware/imu.c': `// IMU fusion — sensor offset calibration
static float bias[3];

void imu_calibrate(void) {
  for (int i = 0; i < 200; i++) {
    imu_read_raw(raw);
    bias[0] += raw[0];
    bias[1] += raw[1];
    bias[2] += raw[2];
  }
  bias[0] /= 200.0f;
  bias[1] /= 200.0f;
  bias[2] /= 200.0f;
}`,
      'hardware/BOM.csv': `Ref,Value,Package,Qty
U1,STM32F405RG,LQFP64,1
U2,MPU6050,QFNLG,1
U3,ICM42688,QFN24,1
Q1-Q4,SI2302,SOT-23,4
R1-R12,10kΩ,0402,12
C1-C16,100nF,0402,16
M1-M4,BH1405,——,4
BAT1,4S LiPo,XT60,1`,
    },
    terminal: [
      ['info', '⚡ Designing "' + title + '"'],
      ['ok', '✔ Resolved domain: embedded hardware'],
      ['ok', '✔ MCU: STM32F405 @ 168 MHz'],
      ['info', '▶ generating schematic netlist…'],
      ['ok', '✔ 214 nets · 96 components'],
      ['info', '▶ autorouting 4-layer board…'],
      ['ok', '✔ route complete · 0 DRC errors'],
      ['info', '▶ writing firmware (bare-metal C)…'],
      ['ok', '✔ IMU fusion + PID loop compiled'],
      ['info', '▶ generating production BOM…'],
      ['ok', '✔ 47 unique parts · all in stock'],
      ['info', '▶ running SI/thermal checks…'],
      ['ok', '✔ signal integrity passed'],
      ['info', '▶ exporting fabrication files…'],
      ['ok', '✔ Gerber + drill + pick&place ready'],
    ],
    dbTables: [
      { name: 'components', rows: [['ref', 'String'], ['value', 'String'], ['package', 'String'], ['qty', 'Int']] },
      { name: 'nets', rows: [['name', 'String'], ['pins', 'Array'], ['length', 'Float']] },
      { name: 'layers', rows: [['layer', 'String'], ['copper', 'Float'], ['viaCount', 'Int']] },
    ],
    git: [
      ['feat: schematic capture + symbols', 'c21aa90'],
      ['feat: 4-layer board layout', 'b8e0f1d'],
      ['feat: firmware bring-up (blink test)', 'de42b11'],
      ['feat: IMU calibration + fusion', '7f19c4a'],
      ['feat: PID flight loop', '31ab8de'],
      ['chore: generate fab exports', '5c30be2'],
    ],
    deploy: ['Validating netlist', 'Running DRC', 'Simulating power rails', 'Compiling firmware', 'Generating Gerber', 'Fab files staged'],
    agents: [
      ['planner', 'System spec: 4-layer flight controller'],
      ['researcher', 'Selected STM32F405 + ICM42688'],
      ['pcb', 'Schematic capture — 96 parts'],
      ['pcb', 'Routing 4 layers · differential pairs'],
      ['firmware', 'Bring-up: clock, UART, I2C'],
      ['firmware', 'IMU fusion + PID tuned'],
      ['qa', 'DRC clean · SI checks passed'],
      ['devops', 'Fab files exported'],
    ],
    previewSrc: null,
  };
}

function buildCadProject(prompt) {
  const name = slugify(prompt.split(' ').slice(0, 4).join(' '));
  const title = prompt.split('\n')[0].trim() || 'Product Design';
  return {
    domain: 'cad',
    name,
    previewTitle: title,
    tree: {
      'cad': {
        'assembly.step': { icon: '⬢', size: '22.4 MB' },
        'part_mount.step': { icon: '⬢', size: '4.1 MB' },
        'part_deck.step': { icon: '⬢', size: '6.3 MB' },
        'render_blender.blend': { icon: '◐', size: '48.2 MB' },
      },
      'docs': {
        'drawing.pdf': { icon: '📄', size: '1.8 MB' },
        'tolerances.md': { icon: '📘', size: '0.9 KB' },
        'materials.md': { icon: '📘', size: '1.1 KB' },
      },
      'manufacture': {
        'gcode.nc': { icon: '⚙️', size: '3.2 MB' },
        'laser_cut.dxf': { icon: '▤', size: '0.4 MB' },
      },
    },
    code: {
      'cad/assembly.step': `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('KEYCODE OS generated assembly'),'2;1');
FILE_NAME('${name}.step','','',(),'KEYCODE OS','', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1=CARTESIAN_POINT('',(0.,0.,0.));
#2=AXIS2_PLACEMENT_3D('',#1,$,$);
#3=CYLINDRICAL_SURFACE('',#2,80.);
#4=MANIFOLD_SOLID_BREP('deck_mount',#5);
ENDSEC;
END-ISO-10303-21;`,
      'manufacture/gcode.nc': `(KEYCODE OS — CNC program)
N10 G90 G94 G17
N20 G21 (mm mode)
N30 T1 M6 (4mm end mill)
N40 S12000 M3
N50 G0 X0 Y0 Z5
N60 G0 X-40 Y-30 Z5
N70 G1 Z-2 F300
N80 G1 X40 Y-30 F900
N90 G1 X40 Y30
N100 G1 X-40 Y30
N110 G1 X-40 Y-30
N120 G0 Z5
N130 M5
N140 M30`,
    },
    terminal: [
      ['info', '⚡ Modeling "' + title + '"'],
      ['ok', '✔ Resolved domain: mechanical design'],
      ['ok', '✔ Material: 6061-T6 aluminum'],
      ['info', '▶ constructing part geometry…'],
      ['ok', '✔ deck · trucks · mount · enclosure'],
      ['info', '▶ running FEA (von Mises)…'],
      ['ok', '✔ max stress 142 MPa < 276 MPa yield'],
      ['info', '▶ generative topology optimization…'],
      ['ok', '✔ -18% mass · stiffness retained'],
      ['info', '▶ building render scene…'],
      ['ok', '✔ PBR materials · studio lighting'],
      ['info', '▶ exporting manufacturing files…'],
      ['ok', '✔ STEP + DXF + G-code generated'],
    ],
    dbTables: [
      { name: 'parts', rows: [['id', 'String'], ['mass', 'Float'], ['volume', 'Float'], ['material', 'String']] },
      { name: 'joints', rows: [['id', 'String'], ['type', 'String'], ['a_part', 'Ref<parts>'], ['b_part', 'Ref<parts>']] },
      { name: 'materials', rows: [['name', 'String'], ['yield', 'Float'], ['density', 'Float']] },
    ],
    git: [
      ['feat: part sketches + constraints', 'aa19d8c'],
      ['feat: full assembly mates', 'f2b41e0'],
      ['feat: FEA validation study', '7d8c2ba'],
      ['feat: topology optimization pass', 'e1c99d3'],
      ['chore: render + manufacturing exports', '4ab3ee1'],
    ],
    deploy: ['Resolving constraints', 'Meshing for FEA', 'Running solver', 'Optimizing geometry', 'Exporting STEP', 'Manufacturing files staged'],
    agents: [
      ['planner', 'Design intent: 4-part assembly'],
      ['researcher', 'Material survey: 6061 vs CF'],
      ['cad', 'Sketches + parametric constraints'],
      ['cad', 'Assembly mates + motion study'],
      ['cad', 'FEA + topology optimization'],
      ['qa', 'Tolerance stack verified'],
      ['devops', 'STEP/DXF/G-code exported'],
    ],
    previewSrc: null,
  };
}

function buildGameProject(prompt) {
  const name = slugify(prompt.split(' ').slice(0, 4).join(' '));
  const title = prompt.split('\n')[0].trim() || 'Game';
  return {
    domain: 'game',
    name,
    previewTitle: title,
    tree: {
      'src': {
        'game.js': { icon: '▶', size: '5.2 KB' },
        'player.js': { icon: '▶', size: '2.1 KB' },
        'world.js': { icon: '◬', size: '3.4 KB' },
        'renderer.js': { icon: '◈', size: '2.8 KB' },
      },
      'assets': {
        'skybox.glb': { icon: '◐', size: '8.6 MB' },
        'character.glb': { icon: '◐', size: '2.2 MB' },
        'level_01.glb': { icon: '◐', size: '14.1 MB' },
      },
      'config': {
        'engine.toml': { icon: '⚙️', size: '0.7 KB' },
        'levels.json': { icon: '📄', size: '1.4 KB' },
      },
      'README.md': { icon: '📘', size: '0.8 KB' },
    },
    code: {
      'src/game.js': `// ${title} — game core generated by KEYCODE OS
import { Player } from './player.js';
import { World } from './world.js';
import { Renderer } from './renderer.js';

class Game {
  constructor() {
    this.renderer = new Renderer();
    this.world = new World('level_01');
    this.player = new Player(this.world.spawn);
    this.keys = {};
    this.clock = performance.now();
  }

  loop(now) {
    const dt = (now - this.clock) / 1000;
    this.clock = now;
    this.player.update(this.keys, dt);
    this.world.update(dt);
    this.renderer.render(this.world, this.player);
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    addEventListener('keydown', (e) => (this.keys[e.code] = true));
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    requestAnimationFrame((t) => this.loop(t));
  }
}

new Game().start();`,
      'src/world.js': `// Procedural world generation
export class World {
  constructor(levelId) {
    this.levels = {
      level_01: { seed: 421, size: 2048, biome: 'neon-city' },
    };
    this.current = this.levels[levelId];
    this.objects = [];
    this._generate();
  }
  _generate() {
    // seeded RNG keeps builds deterministic
    let s = this.current.seed;
    const rng = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    for (let i = 0; i < 400; i++) {
      this.objects.push({
        x: rng() * this.current.size - this.current.size / 2,
        z: rng() * this.current.size - this.current.size / 2,
        h: 1 + rng() * 8,
      });
    }
  }
  update() {}
}`,
      'config/levels.json': `{
  "level_01": {
    "name": "Neon District",
    "seed": 421,
    "size": 2048,
    "enemies": 128,
    "lighting": "HDR bloom",
    "post": ["SSR", "AO", "TAA"]
  },
  "level_02": {
    "name": "Server Vault",
    "seed": 902,
    "size": 3072,
    "enemies": 256,
    "lighting": "volumetric",
    "post": ["Raytraced", "Motion blur"]
  }
}`,
    },
    terminal: [
      ['info', '⚡ Building game: "' + title + '"'],
      ['ok', '✔ Resolved domain: interactive 3D game'],
      ['ok', '✔ Engine: WebGL2 · 60 FPS target'],
      ['info', '▶ generating terrain heightmap…'],
      ['ok', '✔ 2048×2048 · seeded · deterministic'],
      ['info', '▶ building character controller…'],
      ['ok', '✔ physics: capsule + gravity'],
      ['info', '▶ composing lighting rig…'],
      ['ok', '✔ HDR + bloom + fog'],
      ['info', '▶ scripting AI enemies…'],
      ['ok', '✔ 3 enemy archetypes'],
      ['info', '▶ baking occlusion culling…'],
      ['ok', '✔ 60 FPS on mid GPU'],
      ['info', '▶ play-testing level_01…'],
      ['ok', '✔ spawn-to-exit: 4m 32s'],
    ],
    dbTables: [
      { name: 'saves', rows: [['id', 'ObjectId'], ['player', 'Ref<users>'], ['level', 'String'], ['hp', 'Float'], ['updated', 'Date']] },
      { name: 'inventory', rows: [['id', 'ObjectId'], ['owner', 'Ref<users>'], ['item', 'String'], ['qty', 'Int']] },
    ],
    git: [
      ['feat: engine bootstrap + loop', '12bf0aa'],
      ['feat: procedural world gen', '9ad4c10'],
      ['feat: player controller + physics', 'b8ef120'],
      ['feat: AI enemies + spawn waves', '5c0dbee'],
      ['feat: lighting + post-processing', 'ff391ca'],
      ['chore: build + package levels', '0ea1dd5'],
    ],
    deploy: ['Baking level geometry', 'Compiling shaders', 'Warming caches', 'Serving CDN assets', 'Health check', 'Playable URL live'],
    agents: [
      ['planner', 'Game design doc — 3 levels'],
      ['researcher', 'Reference: Neon-punk traversal'],
      ['game', 'Engine core + render loop'],
      ['game', 'Procedural world generation'],
      ['game', 'Player controller + camera'],
      ['game', 'Enemy AI + spawn system'],
      ['uidesigner', 'HUD + menus'],
      ['qa', 'Play-tested level_01'],
    ],
    previewSrc: null,
  };
}

function buildErpProject(prompt) {
  const name = slugify(prompt.split(' ').slice(0, 4).join(' '));
  const title = prompt.split('\n')[0].trim() || 'ERP Suite';
  return {
    domain: 'erp',
    name,
    previewTitle: title,
    tree: {
      'src': {
        'app.tsx': { icon: '⚛️', size: '4.8 KB' },
        'dashboard.tsx': { icon: '⚛️', size: '3.1 KB' },
        'inventory.tsx': { icon: '⚛️', size: '5.4 KB' },
        'billing.tsx': { icon: '⚛️', size: '4.2 KB' },
        'styles.css': { icon: '🎨', size: '6.8 KB' },
      },
      'server': {
        'api.ts': { icon: '🟩', size: '6.2 KB' },
        'auth.ts': { icon: '🟩', size: '2.4 KB' },
        'reports.ts': { icon: '🟩', size: '3.7 KB' },
      },
      'db': {
        'schema.prisma': { icon: '▤', size: '2.9 KB' },
        'seed.ts': { icon: '🟩', size: '1.3 KB' },
      },
      'README.md': { icon: '📘', size: '1.0 KB' },
    },
    code: {
      'db/schema.prisma': `// ERP data model — generated by KEYCODE OS
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Company {
  id         String    @id @default(cuid())
  name       String
  tenant     Tenant?
  users      User[]
  createdAt  DateTime  @default(now())
}

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  role      Role      @default(STAFF)
  company   Company?  @relation(fields: [companyId], references: [id])
  companyId String?
}

model Product {
  id        String      @id @default(cuid())
  sku       String      @unique
  name      String
  price     Decimal
  stock     Int         @default(0)
  reorderAt Int         @default(10)
}

model Invoice {
  id          String   @id @default(cuid())
  number      Int      @unique
  customer    String
  items       Json
  total       Decimal
  status      Status   @default(PENDING)
  createdAt   DateTime @default(now())
}

enum Role { OWNER ADMIN STAFF }
enum Status { PENDING PAID VOID }`,
      'src/billing.tsx': `// Billing module — invoice lifecycle
export function Billing() {
  const [invoices, setInvoices] = useState([]);

  async function createInvoice(customer, items) {
    const res = await api.post('/invoices', { customer, items });
    setInvoices((i) => [res.data, ...i]);
  }

  return (
    <section className="module">
      <h2>Billing</h2>
      <InvoiceList items={invoices} onCreate={createInvoice} />
    </section>
  );
}`,
    },
    terminal: [
      ['info', '⚡ Architecting ERP: "' + title + '"'],
      ['ok', '✔ Resolved domain: enterprise system'],
      ['ok', '✔ Stack: Next.js + Postgres + Prisma'],
      ['info', '▶ designing relational schema…'],
      ['ok', '✔ 14 tables · 9 relations'],
      ['info', '▶ building modules…'],
      ['ok', '✔ CRM · inventory · billing · reports'],
      ['info', '▶ enforcing RBAC…'],
      ['ok', '✔ roles: owner/admin/staff'],
      ['info', '▶ writing migration + seed…'],
      ['ok', '✔ migrations applied'],
      ['info', '▶ generating reports engine…'],
      ['ok', '✔ 12 report templates'],
      ['info', '▶ running e2e suite…'],
      ['ok', '✔ 41 tests · 41 passing'],
    ],
    dbTables: [
      { name: 'companies', rows: [['id', 'String'], ['name', 'String'], ['createdAt', 'Date']] },
      { name: 'users', rows: [['id', 'String'], ['email', 'String'], ['role', 'Enum']] },
      { name: 'products', rows: [['id', 'String'], ['sku', 'String'], ['price', 'Decimal'], ['stock', 'Int']] },
      { name: 'invoices', rows: [['id', 'String'], ['number', 'Int'], ['total', 'Decimal'], ['status', 'Enum']] },
    ],
    git: [
      ['feat: schema + Prisma models', 'e5a09c1'],
      ['feat: auth + RBAC middleware', 'bb1d4f0'],
      ['feat: inventory module', '8f22a4e'],
      ['feat: billing + invoices', '3cd9b22'],
      ['feat: reports engine', 'a0be11f'],
      ['chore: e2e coverage + CI', '1c93d50'],
    ],
    deploy: ['Provisioning database', 'Running migrations', 'Building app bundle', 'Seeding demo data', 'Health checks', 'Tenant URL live'],
    agents: [
      ['planner', 'Blueprint: 6 modules · 14 tables'],
      ['researcher', 'Compared 5 ERP reference flows'],
      ['frontend', 'Dashboard + module shell'],
      ['backend', 'REST + RBAC middleware'],
      ['database', 'Schema, indexes, migrations'],
      ['security', 'Tenant isolation verified'],
      ['qa', 'E2E suite green (41/41)'],
      ['devops', 'Staging environment live'],
    ],
    previewSrc: null,
  };
}

/* ---------------- Build dispatch ---------------- */
export function generateProject(prompt) {
  const domain = detectDomain(prompt);
  let proj;
  switch (domain) {
    case 'pcb': proj = buildPcbProject(prompt); break;
    case 'cad': proj = buildCadProject(prompt); break;
    case 'game': proj = buildGameProject(prompt); break;
    case 'erp': proj = buildErpProject(prompt); break;
    default: proj = buildWebProject(prompt);
  }
  proj.activeAgents = pickActiveAgents(domain);
  proj.domain = domain;
  return proj;
}

/* Flatten tree for file panel */
export function flattenTree(tree, prefix = '') {
  const out = [];
  for (const [key, val] of Object.entries(tree)) {
    const path = prefix ? prefix + '/' + key : key;
    if (val && typeof val === 'object' && !Array.isArray(val) && !('icon' in val)) {
      out.push({ path, dir: true, children: flattenTree(val, path) });
    } else {
      out.push({ path, dir: false, icon: val.icon, size: val.size });
    }
  }
  return out;
}

export function flattenFiles(tree, prefix = '') {
  const out = [];
  for (const [key, val] of Object.entries(tree)) {
    const path = prefix ? prefix + '/' + key : key;
    if (val && typeof val === 'object' && !Array.isArray(val) && !('icon' in val)) {
      out.push(...flattenFiles(val, path));
    } else {
      out.push({ path, icon: val.icon, size: val.size });
    }
  }
  return out;
}
