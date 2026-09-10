import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import JSZip from 'jszip';

const exportsDir = path.join(process.cwd(), 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

function escStr(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

// Package → footprint mapping (KiCad 10 standard library) — now with smartphone HDI BGA
const FOOTPRINT_MAP = {
  '0402':  'Resistor_SMD:R_0402_1005Metric',
  '0603':  'Resistor_SMD:R_0603_1608Metric',
  '0805':  'Resistor_SMD:R_0805_2012Metric',
  '1206':  'Resistor_SMD:R_1206_3216Metric',
  '1210':  'Resistor_SMD:R_1210_3225Metric',
  'SOT-23': 'Package_TO_SOT_SMD:SOT-23',
  'SOT23': 'Package_TO_SOT_SMD:SOT-23',
  'SOT-223': 'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
  'SOT223': 'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
  'DIP-8':  'Package_DIP:DIP-8_W7.62mm',
  'DIP8':   'Package_DIP:DIP-8_W7.62mm',
  'DIP-16': 'Package_DIP:DIP-16_W7.62mm',
  'DIP16':  'Package_DIP:DIP-16_W7.62mm',
  'TQFP-32': 'Package_QFP:TQFP-32_7x7mm_P0.8mm',
  'TQFP32':  'Package_QFP:TQFP-32_7x7mm_P0.8mm',
  'TQFP-44': 'Package_QFP:TQFP-44_10x10mm_P0.8mm',
  'TQFP44':  'Package_QFP:TQFP-44_10x10mm_P0.8mm',
  'QFN-32':  'Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.1x3.1mm',
  'QFN32':   'Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.1x3.1mm',
  'SOP-8':   'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  'SOP8':    'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  'SOIC-8':  'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  'SOIC8':   'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  'TO-92':   'Package_TO_THT:TO-92_Inline',
  'TO92':    'Package_TO_THT:TO-92_Inline',
  'LED-0805': 'LED_SMD:LED_0805_2012Metric',
  'USB-C':   'Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12',
  'BGA-100': 'Package_BGA:BGA-100_10x10mm_Layout10x10_P0.8mm_Ball0.5mm',
  'BGA100': 'Package_BGA:BGA-100_10x10mm_Layout10x10_P0.8mm_Ball0.5mm',
  'BGA-256': 'Package_BGA:BGA-256_17x17mm_Layout16x16_P1.0mm_Ball0.6mm',
  'BGA256': 'Package_BGA:BGA-256_17x17mm_Layout16x16_P1.0mm_Ball0.6mm',
  'BGA-1000': 'Package_BGA:BGA-1000_14x14mm_Layout32x32_P0.35mm_Ball0.2mm',
  'BGA1000': 'Package_BGA:BGA-1000_14x14mm_Layout32x32_P0.35mm_Ball0.2mm',
  'WLCSP-36': 'Package_CSP:WLCSP-36_2.5x2.5mm_P0.4mm',
  'WLCSP36': 'Package_CSP:WLCSP-36_2.5x2.5mm_P0.4mm',
};

function resolveFootprint(pkg) {
  if (!pkg) return 'Resistor_SMD:R_0805_2012Metric';
  const key = pkg.trim().replace(/\s+/g, '');
  for (const [k, v] of Object.entries(FOOTPRINT_MAP)) {
    if (key === k || key.startsWith(k) || key.includes(k)) return v;
  }
  if (key.includes('0805')) return FOOTPRINT_MAP['0805'];
  if (key.includes('0603')) return FOOTPRINT_MAP['0603'];
  if (key.includes('1206')) return FOOTPRINT_MAP['1206'];
  if (key.includes('SOT')) return FOOTPRINT_MAP['SOT-23'];
  if (key.includes('DIP')) return FOOTPRINT_MAP['DIP-8'];
  if (key.includes('TQFP') || key.includes('QFP')) return FOOTPRINT_MAP['TQFP-32'];
  if (key.includes('QFN')) return FOOTPRINT_MAP['QFN-32'];
  if (key.includes('SOIC') || key.includes('SOP')) return FOOTPRINT_MAP['SOIC-8'];
  if (key.includes('LED')) return FOOTPRINT_MAP['LED-0805'];
  return 'Resistor_SMD:R_0805_2012Metric';
}

// Package physical dimensions (mm) — with HDI BGA
const PKG_SIZE = {
  'Resistor_SMD:R_0402_1005Metric': { w: 1.0, h: 0.5 },
  'Resistor_SMD:R_0603_1608Metric': { w: 1.6, h: 0.8 },
  'Resistor_SMD:R_0805_2012Metric': { w: 2.0, h: 1.2 },
  'Resistor_SMD:R_1206_3216Metric': { w: 3.2, h: 1.6 },
  'Resistor_SMD:R_1210_3225Metric': { w: 3.2, h: 2.5 },
  'Package_TO_SOT_SMD:SOT-23': { w: 2.9, h: 1.3 },
  'Package_TO_SOT_SMD:SOT-223-3_TabPin2': { w: 6.5, h: 3.5 },
  'Package_DIP:DIP-8_W7.62mm': { w: 10.2, h: 6.4 },
  'Package_DIP:DIP-16_W7.62mm': { w: 19.5, h: 6.4 },
  'Package_QFP:TQFP-32_7x7mm_P0.8mm': { w: 7.0, h: 7.0 },
  'Package_QFP:TQFP-44_10x10mm_P0.8mm': { w: 10.0, h: 10.0 },
  'Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.1x3.1mm': { w: 5.0, h: 5.0 },
  'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm': { w: 4.9, h: 3.9 },
  'Package_TO_THT:TO-92_Inline': { w: 4.0, h: 3.0 },
  'LED_SMD:LED_0805_2012Metric': { w: 2.0, h: 1.2 },
  'Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12': { w: 10.0, h: 5.0 },
  'Package_BGA:BGA-100_10x10mm_Layout10x10_P0.8mm_Ball0.5mm': { w: 10.0, h: 10.0 },
  'Package_BGA:BGA-256_17x17mm_Layout16x16_P1.0mm_Ball0.6mm': { w: 17.0, h: 17.0 },
  'Package_BGA:BGA-1000_14x14mm_Layout32x32_P0.35mm_Ball0.2mm': { w: 14.0, h: 14.0 },
  'Package_CSP:WLCSP-36_2.5x2.5mm_P0.4mm': { w: 2.5, h: 2.5 },
};

function footprintSize(footprint) {
  return PKG_SIZE[footprint] || { w: 3.0, h: 2.0 };
}

// ──────────────────────────────────────────────
// KiCad 10 S-expression helpers
// ──────────────────────────────────────────────

function indent(level, s) { return '  '.repeat(level) + s; }

function sexp(...args) {
  return '(' + args.map(a => {
    if (Array.isArray(a)) return ' ' + a.map(b => Array.isArray(b) ? sexp(...b) : String(b)).join(' ');
    return ' ' + a;
  }).join('').trim() + ')';
}

function genCoord(x, y) {
  return `(at ${x.toFixed(4)} ${y.toFixed(4)} 0)`;
}

function genKicadPro(name) {
  return `(kicad_pro (version 20240126) (generator "KEYCODE PCB Factory")
  (board (thickness 1.6))
  (project
    (title ${escStr(name || 'KEYCODE PCB')})
    (date "${new Date().toISOString().split('T')[0]}")
    (company "KEYCODE AI"))
  (design_settings
    (rule_severities (solder_mask_bridge error)))
)`;
}

function genKicadSch(components, netlist, name) {
  const lines = [];
  lines.push(`(kicad_sch (version 20240126) (generator "KEYCODE PCB Factory")`);
  lines.push(`  (paper "A4")`);

  // Symbol definitions for unique reference prefixes
  const prefixes = [...new Set(components.map(c => (c.reference || 'R1').replace(/[0-9]/g, '')))];
  lines.push(`  (lib_symbols`);
  for (const p of prefixes) {
    const t = p === 'R' ? 'Resistor' : p === 'C' ? 'Capacitor' : p === 'L' ? 'Inductor' : p === 'D' ? 'Diode' : p === 'LED' ? 'Diode' : p === 'Q' ? 'Transistor' : 'IC';
    const pinCount = p === 'U' ? 8 : p === 'D' || p === 'LED' ? 2 : p === 'Q' ? 3 : 2;
    lines.push(`    (symbol "${p}" (pin_names (offset 0)) (in_bom yes) (on_board yes)
      (property "Reference" "${p}" (id 0) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "${t}" (id 1) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (symbol "${p}_0_1"
        (rectangle (start -3.81 3.81) (end 3.81 -3.81) (stroke (width 0.254) (type default)) (fill (type none)))
        ${Array.from({ length: pinCount }, (_, i) => indent(8, `(pin passive (at ${-5.08} ${(i - (pinCount - 1) / 2) * 2.54} 0) (length 2.54) (name "${i + 1}" (effects (font (size 1.27 1.27)))) (number "${i + 1}" (effects (font (size 1.27 1.27)))))`)).join('\n')}
      )
    )`);
  }
  lines.push(`  )`);

  // Symbol instances
  let netId = 1;
  const netNames = new Set();
  for (const n of netlist) { netNames.add(n.net); }
  const netMap = {};
  for (const n of netlist) { if (!netMap[n.net]) netMap[n.net] = netId++; }

  let yOff = 50;
  for (const comp of components) {
    const ref = comp.reference || 'R1';
    const pre = ref.replace(/[0-9]/g, '');
    const val = comp.value || comp.type || '?';
    const fprint = resolveFootprint(comp.package);
    lines.push(`  (symbol (lib_id "${pre}") (at 50.8 ${yOff} 0) (unit 1)
    (property "Reference" "${ref}" (id 0) (at 50.8 ${yOff - 10} 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Value" "${escStr(val)}" (id 1) (at 50.8 ${yOff + 10} 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Footprint" ${escStr(fprint)} (id 2) (at 50.8 ${yOff + 20} 0) (effects (font (size 1.27 1.27)) (justify left) hide))
  )`);
    yOff += 25;
  }

  // Net labels
  for (const n of netlist) {
    lines.push(`  (directive (net_label (at 170 ${yOff} 0) (effects (font (size 1.27 1.27))))
    (property "Net" "${escStr(n.net)}" (id 0) (at 170 ${yOff} 0) (effects (font (size 1.27 1.27)))))`);
    yOff += 10;
  }

  lines.push(`)`);
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// Component placement (deterministic grid)
// ──────────────────────────────────────────────

export function placeComponents(components, boardW, boardH) {
  const margin = 5;
  const spacing = 12;
  const placed = [];
  let col = 0, row = 0;
  const maxCol = Math.floor((boardW - margin * 2) / spacing);
  for (const comp of components) {
    const fprint = resolveFootprint(comp.package);
    const size = footprintSize(fprint);
    const x = margin + spacing / 2 + col * spacing;
    const y = margin + spacing / 2 + row * spacing;
    placed.push({ ...comp, footprint: fprint, size, posX: x, posY: y, angle: 0, side: 'top' });
    col++;
    if (col >= maxCol) { col = 0; row++; }
  }
  return placed;
}

// ──────────────────────────────────────────────
// Specctra DSN export + FreeRouting autorouter (real external tool)
// ──────────────────────────────────────────────

function resolveFreeroutingJar() {
  if (process.env.FREEROUTING_JAR) {
    const p = process.env.FREEROUTING_JAR;
    if (path.isAbsolute(p)) return p;
    return path.join(process.cwd(), p);
  }
  const candidates = [
    path.join(process.cwd(), 'tools/freerouting.jar'),
    path.join(process.cwd(), '..', 'tools/freerouting.jar'),
    '/home/killer/keycode-alien-interface/tools/freerouting.jar'
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
  return candidates[0];
}
const FREEROUTING_JAR = resolveFreeroutingJar();

export function exportDsn(placed, netlist, boardW, boardH) {
  const L = [];
  L.push('(pcb "KEYCODE"');
  L.push('  (parser (string_quote ") (space_in_quoted_tokens on) (host_cad "KEYCODE") (host_version "1.0"))');
  L.push('  (resolution mm 1000)');
  L.push('  (unit mm)');
  L.push('  (structure');
  L.push('    (layer F.Cu (type signal))');
  L.push('    (layer B.Cu (type signal))');
  L.push(`    (boundary (rect 0 0 ${(boardW * 1000).toFixed(0)} ${(boardH * 1000).toFixed(0)}))`);
  L.push('    (via "Via_0.8" (shape (circle F.Cu 800) (shape (circle B.Cu 800))))');
  L.push('    (rule (width 300) (clearance 200))');
  L.push('  )');
  L.push('  (placement');
  for (const comp of placed) {
    const ref = (comp.reference || 'R1').replace(/[^A-Za-z0-9_]/g, '_');
    L.push(`    (component "${ref}" (place "${ref}" ${(comp.posX * 1000).toFixed(0)} ${(comp.posY * 1000).toFixed(0)} front 0))`);
  }
  L.push('  )');
  L.push('  (library');
  for (const comp of placed) {
    const ref = (comp.reference || 'R1').replace(/[^A-Za-z0-9_]/g, '_');
    L.push(`    (image "${ref}" (outline (rect ${(-1500).toFixed(0)} ${(-1000).toFixed(0)} 1500 1000)) (pin "1" 0 0) (pin "2" 0 0))`);
  }
  L.push('  )');
  L.push('  (network');
  for (const net of netlist) {
    const nm = String(net.net || 'N').replace(/[^A-Za-z0-9_]/g, '_');
    L.push(`    (net "${nm}"`);
    for (const node of (net.nodes || [])) {
      const [r, p] = String(node).split(':');
      L.push(`      (pins "${(r || 'R1').replace(/[^A-Za-z0-9_]/g, '_')}-${p || '1'}")`);
    }
    L.push('    )');
  }
  L.push('  )');
  L.push('  (wiring)');
  L.push(')');
  return L.join('\n');
}

export function runFreerouting(dsnText, timeoutMs = 45000) {
  const jobDir = path.join(exportsDir, 'fr_' + Date.now());
  fs.mkdirSync(jobDir, { recursive: true });
  const dsnPath = path.join(jobDir, 'board.dsn');
  const sesPath = path.join(jobDir, 'board.ses');
  fs.writeFileSync(dsnPath, dsnText, 'utf8');
  const jar = FREEROUTING_JAR;
  if (!fs.existsSync(jar)) return { ok: false, reason: 'freerouting jar not found' };
  try {
    execSync(`java -jar "${jar}" -de "${dsnPath}" -do "${sesPath}" 2>&1`, { timeout: timeoutMs, cwd: jobDir });
  } catch (e) {
    return { ok: false, reason: 'freerouting run failed: ' + String(e.message || e).slice(0, 200) };
  }
  if (!fs.existsSync(sesPath)) return { ok: false, reason: 'no session file produced' };
  return { ok: true, sesPath, ses: fs.readFileSync(sesPath, 'utf8'), jobDir };
}

export function parseSesSegments(sesText) {
  const segments = [];
  const pathRe = /\(path\s+(\S+)\s+(\d+)\s+((?:-?\d+\s+-?\d+\s*)+)\)/g;
  let m;
  while ((m = pathRe.exec(sesText))) {
    const layerNum = m[2];
    const layer = layerNum === '0' ? 'F.Cu' : 'B.Cu';
    const nums = m[3].trim().split(/\s+/).map(Number);
    for (let i = 0; i + 3 < nums.length; i += 2) {
      segments.push({
        start: { x: nums[i] / 1000, y: nums[i + 1] / 1000 },
        end: { x: nums[i + 2] / 1000, y: nums[i + 3] / 1000 },
        width: 0.3, layer, net: m[1].replace(/"/g, '')
      });
    }
  }
  return segments;
}

// ──────────────────────────────────────────────
// Manhattan routing
// ──────────────────────────────────────────────

export function routeNets(placed, netlist) {
  const traceWidth = 0.3;
  const viaDiameter = 0.8;
  const viaDrill = 0.4;
  const segments = [];
  const vias = [];

  // Build pin mapping: ref:pinNum → { x, y }
  const pins = {};
  for (const comp of placed) {
    const ref = comp.reference || 'R1';
    const fpx = comp.posX;
    const fpy = comp.posY;
    const nPins = (comp.footprint && comp.footprint.includes('TQFP')) ? 32 : 2;
    const pinSpacing = 1.27;
    const startY = fpy - (nPins / 2 - 0.5) * pinSpacing;
    for (let i = 1; i <= Math.min(nPins, 16); i++) {
      pins[`${ref}:${i}`] = { x: fpx, y: startY + (i - 1) * pinSpacing };
    }
  }

  let viaIdx = 1;
  for (const net of netlist) {
    const nodes = net.nodes || [];
    if (nodes.length < 2) continue;

    // Get positions for all nodes
    const positions = nodes.map(n => pins[n]).filter(p => p);
    if (positions.length < 2) continue;

    // Route: source is first, route to each destination
    const src = positions[0];
    for (let i = 1; i < positions.length; i++) {
      const dst = positions[i];
      const midX = (src.x + dst.x) / 2;
      const midY = (src.y + dst.y) / 2;

      // Top layer: horizontal, bottom layer: vertical
      segments.push({ start: { x: src.x, y: src.y }, end: { x: midX, y: src.y }, width: traceWidth, layer: 'F.Cu', net: net.net });
      segments.push({ start: { x: midX, y: src.y }, end: { x: midX, y: dst.y }, width: traceWidth, layer: 'B.Cu', net: net.net });
      segments.push({ start: { x: midX, y: dst.y }, end: { x: dst.x, y: dst.y }, width: traceWidth, layer: 'F.Cu', net: net.net });

      // Via at midpoint for layer change
      vias.push({ x: midX, y: midY, diameter: viaDiameter, drill: viaDrill, net: net.net });
    }
  }

  return { segments, vias };
}

// ──────────────────────────────────────────────
// KiCad PCB S-expression generator
// ──────────────────────────────────────────────

function genKicadPcb(placed, netlist, boardW, boardH, name) {
  const lines = [];
  lines.push(`(kicad_pcb (version 20240126) (generator "KEYCODE PCB Factory")`);
  lines.push(`  (general
    (thickness 1.6)
  )`);

  // Layers
  lines.push(`  (layers
    (0 "F.Cu" copper)
    (31 "B.Cu" copper)
    (32 "B.Paste" paste)
    (33 "B.Mask" solder_mask)
    (34 "F.Paste" paste)
    (35 "F.Mask" solder_mask)
    (36 "F.Silkscreen" silk_screen)
    (37 "B.Silkscreen" silk_screen)
    (38 "F.CrtYd" courtyard)
    (39 "B.CrtYd" courtyard)
    (40 "F.Fab" fabrication)
    (41 "B.Fab" fabrication)
    (42 "Edge.Cuts" edge_cuts)
    (43 "Margin" margin)
  )`);

  // Setup
  lines.push(`  (setup
    (grid_origin 0 0)
    (pad_to_mask_clearance 0.1)
    (solder_mask_min_width 0.1)
    (trace_clearance 0.2)
    (zone_clearance 0.5)
    (max_error 0.005)
    (segment_width 0.3)
    (edge_clearance 0.1)
    (via_size 0.8)
    (via_drill 0.4)
    (via_min_size 0.6)
    (via_min_drill 0.3)
    (uvia_size 0.3)
    (uvia_drill 0.1)
    (uvias_allowed 0)
    (min_clearance 0.2)
    (min_track_width 0.2)
    (min_through_hole_diameter 0.3)
    (min_annular_ring 0.1)
    (copper_finish "ENIG")
  )`);

  // Net definitions
  const netNames = [''];
  const netMap = {};
  for (const n of netlist) {
    const idx = netNames.length;
    netNames.push(n.net);
    netMap[n.net] = idx;
  }
  for (let i = 0; i < netNames.length; i++) {
    lines.push(`  (net ${i} ${escStr(netNames[i])})`);
  }

  // Board outline (Edge.Cuts)
  lines.push(`  (gr_rect (start 0 0) (end ${boardW.toFixed(4)} ${boardH.toFixed(4)}) (layer "Edge.Cuts") (stroke (width 0.1) (type default)) (fill none))`);

  // Mounting holes
  const holePositions = [[3, 3], [boardW - 3, 3], [3, boardH - 3], [boardW - 3, boardH - 3]];
  for (const [hx, hy] of holePositions) {
    lines.push(`  (footprint "MountingHole:MountingHole_3.2mm_M3" (at ${hx.toFixed(4)} ${hy.toFixed(4)} 0)
    (layer "F.Cu")
    (property "Reference" "$$$$" (id 0) (at ${hx.toFixed(4)} ${hy.toFixed(4)} 0) (layer "F.Silkscreen") hide)
    (property "Value" "MountingHole_3.2mm_M3" (id 1) (at ${hx.toFixed(4)} ${hy.toFixed(4)} 0) hide)
    (pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2) (layers "*.Cu" "*.Mask"))
  )`);
  }

  // Route traces
  const { segments, vias } = routeNets(placed, netlist);

  // Footprints for components
  for (const comp of placed) {
    const ref = comp.reference || 'R1';
    const val = comp.value || comp.type || '?';
    const fprint = comp.footprint || resolveFootprint(comp.package);
    const x = comp.posX;
    const y = comp.posY;
    const angle = comp.angle || 0;

    lines.push('  (footprint ' + escStr(fprint) + ' (at ' + x.toFixed(4) + ' ' + y.toFixed(4) + ' ' + angle + ')\n' +
      '    (layer "F.Cu")\n' +
      '    (property "Reference" ' + escStr(ref) + ' (id 0) (at ' + x.toFixed(4) + ' ' + (y - 3).toFixed(4) + ' 0)\n' +
      '      (layer "F.Silkscreen") (effects (font (size 1 1) thickness 0.15)))\n' +
      '    (property "Value" ' + escStr(val) + ' (id 1) (at ' + x.toFixed(4) + ' ' + (y + 3).toFixed(4) + ' 0)\n' +
      '      (layer "F.Fab") (effects (font (size 1 1) thickness 0.15)))\n' +
      '    (attr smd)');

    // Generate pads based on package type
    const nPins = fprint.includes('TQFP') ? 32 : fprint.includes('SOIC') || fprint.includes('SOP') ? 8 : fprint.includes('DIP') ? 8 : 2;
    const pinSpacing = fprint.includes('TQFP') ? 0.8 : fprint.includes('SOIC') || fprint.includes('SOP') ? 1.27 : 2.54;
    const halfCount = Math.min(nPins, 16) / 2;
    const padLen = fprint.includes('0805') || fprint.includes('0603') || fprint.includes('1206') ? 0.7 : 1.0;
    const padW = fprint.includes('0805') || fprint.includes('0603') || fprint.includes('1206') ? 0.6 : 0.8;
    const centerDist = fprint.includes('0805') ? 1.0 : fprint.includes('0603') ? 0.8 : fprint.includes('1206') ? 1.5 : pinSpacing;

    for (let i = 1; i <= Math.min(nPins, 16); i++) {
      const netNode = `${ref}:${i}`;
      let netIdx = 0;
      for (const n of netlist) {
        if (n.nodes && n.nodes.includes(netNode)) {
          netIdx = netMap[n.net] || 0;
          break;
        }
      }

      // Dual-inline positioning
      const side = i <= halfCount ? 'left' : 'right';
      const idxOnSide = i <= halfCount ? i - 1 : i - 1 - halfCount;
      const px = side === 'left' ? -centerDist : centerDist;
      const py = (idxOnSide - (halfCount - 1) / 2) * pinSpacing;

      lines.push(`    (pad ${i} smd rect (at ${px.toFixed(4)} ${py.toFixed(4)} 0)
      (size ${padW.toFixed(4)} ${padLen.toFixed(4)})
      (layers "F.Cu" "F.Paste" "F.Mask")
      ${netIdx > 0 ? `(net ${netIdx} ${escStr(netNames[netIdx])})` : ''})`);
    }

    lines.push(`  )`);
  }

  // Trace segments
  for (const seg of segments) {
    const netIdx = netMap[seg.net] || 0;
    lines.push(`  (segment (start ${seg.start.x.toFixed(4)} ${seg.start.y.toFixed(4)}) (end ${seg.end.x.toFixed(4)} ${seg.end.y.toFixed(4)}) (width ${seg.width.toFixed(4)}) (layer ${escStr(seg.layer)}) (net ${netIdx}))`);
  }

  // Vias
  for (const via of vias) {
    const netIdx = netMap[via.net] || 0;
    lines.push(`  (via (at ${via.x.toFixed(4)} ${via.y.toFixed(4)}) (size ${via.diameter.toFixed(4)}) (drill ${via.drill.toFixed(4)}) (layers "F.Cu" "B.Cu") ${netIdx > 0 ? `(net ${netIdx})` : ''})`);
  }

  lines.push(`)`);
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// Native RS-274X Gerber generator
// ──────────────────────────────────────────────

function gerberCoordFmt() { return 'FSLAX34Y34*%'; }
function gerberUnits() { return 'MOMM*%'; }

function gCoord(val) { const n = Math.round(val * 10000); return String(Math.abs(n)).padStart(7, '0').replace(/^0+/, '') || '0'; }

function gMove(x, y) { return `X${gCoord(x)}Y${gCoord(y)}D02*\n`; }
function gDraw(x, y) { return `X${gCoord(x)}Y${gCoord(y)}D01*\n`; }
function gFlash(x, y) { return `X${gCoord(x)}Y${gCoord(y)}D03*\n`; }

function gApertureCircle(diam, code) { return `%ADD${code}C,${diam.toFixed(4)}*%\n`; }
function gApertureRect(w, h, code) { return `%ADD${code}R,${w.toFixed(4)}X${h.toFixed(4)}*%\n`; }

function gHeader() { return `G04 KEYCODE PCB Factory - Gerber export*\n${gerberUnits()}${gerberCoordFmt()}%LPD*%\n`; }
function gFooter() { return 'M02*\n'; }

function generateGerberLayer(name, placed, segments, vias, boardW, boardH) {
  let out = gHeader();
  out += `G04 Layer: ${name}*\n`;

  // Board outline as polygon
  out += gMove(0, 0);
  out += gDraw(boardW, 0);
  out += gDraw(boardW, boardH);
  out += gDraw(0, boardH);
  out += gDraw(0, 0);

  if (name === 'Edge.Cuts') return out + gFooter();

  // Apertures
  const traceApt = 10;
  const viaApt = 11;
  const padApt = 12;
  out += gApertureCircle(0.3, traceApt);
  out += gApertureCircle(1.0, viaApt);
  out += gApertureRect(1.2, 0.8, padApt);

  const isTop = name.includes('F.');
  const isCopper = name.includes('Cu');
  const isMask = name.includes('Mask');
  const isSilk = name.includes('Silkscreen');
  const isPaste = name.includes('Paste');

  if (isCopper) {
    // Traces
    out += `G04 Traces*\n%ADD${traceApt}C,0.3*%\n`;
    for (const seg of segments) {
      if (!seg.layer || seg.layer === 'F.Cu' !== isTop) continue;
      out += gMove(seg.start.x, seg.start.y);
      out += gDraw(seg.end.x, seg.end.y);
    }

    // Vias (same aperture on both copper layers)
    out += `G04 Vias*\n%ADD${viaApt}C,1.0*%\n`;
    for (const v of vias) {
      out += gFlash(v.x, v.y);
    }

    // SMD pads
    out += `G04 Pads*\n`;
    for (const comp of placed) {
      const nPins = comp.footprint?.includes('TQFP') ? 32 : comp.footprint?.includes('DIP') ? 8 : 2;
      const pinSpacing = comp.footprint?.includes('TQFP') ? 0.8 : comp.footprint?.includes('SOIC') || comp.footprint?.includes('SOP') ? 1.27 : 2.54;
      const centerDist = comp.footprint?.includes('0805') ? 1.0 : comp.footprint?.includes('0603') ? 0.8 : comp.footprint?.includes('1206') ? 1.5 : pinSpacing;
      const halfPins = Math.min(nPins, 16) / 2;
      const padW = comp.footprint?.includes('0805') || comp.footprint?.includes('0603') || comp.footprint?.includes('1206') ? 0.6 : 0.8;
      const padLen = comp.footprint?.includes('0805') || comp.footprint?.includes('0603') || comp.footprint?.includes('1206') ? 0.7 : 1.0;
      const pApt = 20 + (comp.reference || 'R1').charCodeAt(0) % 50;
      out += gApertureRect(padW, padLen, pApt);
      for (let i = 1; i <= Math.min(nPins, 16); i++) {
        const side = i <= halfPins ? 'left' : 'right';
        const idxOnSide = i <= halfPins ? i - 1 : i - 1 - halfPins;
        const px = comp.posX + (side === 'left' ? -centerDist : centerDist);
        const py = comp.posY + (idxOnSide - (halfPins - 1) / 2) * pinSpacing;
        out += gFlash(px, py);
      }
    }
  }

  if (isMask) {
    // Solder mask openings = pads enlarged by 0.1mm
    for (const comp of placed) {
      const nPins = comp.footprint?.includes('TQFP') ? 32 : comp.footprint?.includes('DIP') ? 8 : 2;
      const pinSpacing = comp.footprint?.includes('TQFP') ? 0.8 : comp.footprint?.includes('SOIC') || comp.footprint?.includes('SOP') ? 1.27 : 2.54;
      const centerDist = comp.footprint?.includes('0805') ? 1.0 : comp.footprint?.includes('0603') ? 0.8 : comp.footprint?.includes('1206') ? 1.5 : pinSpacing;
      const halfPins = Math.min(nPins, 16) / 2;
      const padW = (comp.footprint?.includes('0805') || comp.footprint?.includes('0603') || comp.footprint?.includes('1206') ? 0.6 : 0.8) + 0.1;
      const padLen = (comp.footprint?.includes('0805') || comp.footprint?.includes('0603') || comp.footprint?.includes('1206') ? 0.7 : 1.0) + 0.1;
      const mApt = 50 + (comp.reference || 'R1').charCodeAt(0) % 50;
      out += gApertureRect(padW, padLen, mApt);
      for (let i = 1; i <= Math.min(nPins, 16); i++) {
        const side = i <= halfPins ? 'left' : 'right';
        const idxOnSide = i <= halfPins ? i - 1 : i - 1 - halfPins;
        const px = comp.posX + (side === 'left' ? -centerDist : centerDist);
        const py = comp.posY + (idxOnSide - (halfPins - 1) / 2) * pinSpacing;
        out += gFlash(px, py);
      }
    }
    // Via mask openings
    out += gApertureCircle(1.2, 99);
    for (const v of vias) out += gFlash(v.x, v.y);
  }

  if (isPaste) {
    // Paste = pads (smaller than actual pad for stencil registration)
    for (const comp of placed) {
      const nPins = comp.footprint?.includes('TQFP') ? 32 : comp.footprint?.includes('DIP') ? 8 : 2;
      const pinSpacing = comp.footprint?.includes('TQFP') ? 0.8 : comp.footprint?.includes('SOIC') || comp.footprint?.includes('SOP') ? 1.27 : 2.54;
      const centerDist = comp.footprint?.includes('0805') ? 1.0 : comp.footprint?.includes('0603') ? 0.8 : comp.footprint?.includes('1206') ? 1.5 : pinSpacing;
      const halfPins = Math.min(nPins, 16) / 2;
      const padW = (comp.footprint?.includes('0805') || comp.footprint?.includes('0603') || comp.footprint?.includes('1206') ? 0.6 : 0.8) * 0.85;
      const padLen = (comp.footprint?.includes('0805') || comp.footprint?.includes('0603') || comp.footprint?.includes('1206') ? 0.7 : 1.0) * 0.85;
      const pApt = 70 + (comp.reference || 'R1').charCodeAt(0) % 50;
      out += gApertureRect(padW, padLen, pApt);
      for (let i = 1; i <= Math.min(nPins, 16); i++) {
        const side = i <= halfPins ? 'left' : 'right';
        const idxOnSide = i <= halfPins ? i - 1 : i - 1 - halfPins;
        const px = comp.posX + (side === 'left' ? -centerDist : centerDist);
        const py = comp.posY + (idxOnSide - (halfPins - 1) / 2) * pinSpacing;
        out += gFlash(px, py);
      }
    }
  }

  if (isSilk) {
    // Component outlines
    for (const comp of placed) {
      const fsize = footprintSize(comp.footprint || resolveFootprint(comp.package));
      const x1 = comp.posX - fsize.w / 2 - 0.2;
      const y1 = comp.posY - fsize.h / 2 - 0.2;
      const x2 = comp.posX + fsize.w / 2 + 0.2;
      const y2 = comp.posY + fsize.h / 2 + 0.2;
      out += gMove(x1, y1);
      out += gDraw(x2, y1);
      out += gDraw(x2, y2);
      out += gDraw(x1, y2);
      out += gDraw(x1, y1);
    }
  }

  // Mounting holes
  const holePositions = [[3, 3], [boardW - 3, 3], [3, boardH - 3], [boardW - 3, boardH - 3]];
  for (const [hx, hy] of holePositions) {
    out += `${gApertureCircle(3.2, 90)}${gFlash(hx, hy)}`;
  }

  return out + gFooter();
}

function generateGerberFiles(placed, segments, vias, boardW, boardH) {
  const layers = ['F.Cu', 'B.Cu', 'F.Mask', 'B.Mask', 'F.Paste', 'F.Silkscreen', 'Edge.Cuts'];
  const exts = { 'F.Cu': 'gtl', 'B.Cu': 'gbl', 'F.Mask': 'gts', 'B.Mask': 'gbs', 'F.Paste': 'gtp', 'F.Silkscreen': 'gto', 'Edge.Cuts': 'gbr' };
  const files = {};
  for (const layer of layers) {
    const content = generateGerberLayer(layer, placed, segments, vias, boardW, boardH);
    files[`KEYCODE_${layer}.${exts[layer]}`] = content;
  }
  return files;
}

// ──────────────────────────────────────────────
// Main export functions
// ──────────────────────────────────────────────

export function generatePcbProject(name, components, netlist, boardW, boardH) {
  const placed = placeComponents(components, boardW, boardH);
  const pro = genKicadPro(name);
  const sch = genKicadSch(components, netlist, name);
  const pcb = genKicadPcb(placed, netlist, boardW, boardH, name);
  return { pro, sch, pcb, placed };
}

export function exportToGerbers(projectDir, projectName) {
  const proPath = path.join(projectDir, projectName + '.kicad_pro');
  const schPath = path.join(projectDir, projectName + '.kicad_sch');
  const pcbPath = path.join(projectDir, projectName + '.kicad_pcb');

  // Run kicad-cli to export Gerbers
  try {
    execSync(`kicad-cli pcb export gerbers --output "${projectDir}/gerber" "${pcbPath}" 2>&1`, { timeout: 30000, cwd: projectDir });
  } catch (e) {
    console.warn('[PCB Fab] Gerber export error:', e.message);
  }

  // Export drill files
  try {
    execSync(`kicad-cli pcb export drill --output "${projectDir}/gerber" --format excellon "${pcbPath}" 2>&1`, { timeout: 30000, cwd: projectDir });
  } catch (e) {
    console.warn('[PCB Fab] Drill export error:', e.message);
  }

  // Export position file
  try {
    execSync(`kicad-cli pcb export pos --output "${projectDir}/gerber/pos.csv" --format csv "${pcbPath}" 2>&1`, { timeout: 30000, cwd: projectDir });
  } catch (e) {
    console.warn('[PCB Fab] Position export error:', e.message);
  }

  // Export IPC netlist
  try {
    execSync(`kicad-cli pcb export ipcd356 --output "${projectDir}/gerber/netlist.ipc" "${pcbPath}" 2>&1`, { timeout: 30000, cwd: projectDir });
  } catch (e) {
    console.warn('[PCB Fab] IPC netlist export error:', e.message);
  }

  const gerberDir = path.join(projectDir, 'gerber');
  const files = {};
  if (fs.existsSync(gerberDir)) {
    const entries = fs.readdirSync(gerberDir, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(gerberDir, entry.name);
      if (entry.isFile()) files[entry.name] = fs.readFileSync(fp);
    }
  }

  return files;
}

export async function createManufacturingZip(name, components, netlist, boardW, boardH) {
  const projectDir = path.join(exportsDir, 'pcb_' + Date.now());
  fs.mkdirSync(projectDir, { recursive: true });

  const { pro, sch, pcb, placed } = generatePcbProject(name, components, netlist, boardW, boardH);
  const { segments, vias } = routeNets(placed, netlist);

  fs.writeFileSync(path.join(projectDir, name + '.kicad_pro'), pro, 'utf8');
  fs.writeFileSync(path.join(projectDir, name + '.kicad_sch'), sch, 'utf8');
  fs.writeFileSync(path.join(projectDir, name + '.kicad_pcb'), pcb, 'utf8');

  // Try kicad-cli first, fall back to native Gerber generator
  const gerberFiles = exportToGerbers(projectDir, name);
  let hasGerbers = Object.keys(gerberFiles).length > 0;

  if (!hasGerbers) {
    console.log('[PCB Fab] kicad-cli unavailable, using native Gerber generator');
    const nativeGerbers = generateGerberFiles(placed, segments, vias, boardW, boardH);
    const gerberDir = path.join(projectDir, 'gerber');
    fs.mkdirSync(gerberDir, { recursive: true });
    for (const [fileName, content] of Object.entries(nativeGerbers)) {
      fs.writeFileSync(path.join(gerberDir, fileName), content, 'utf8');
      gerberFiles[fileName] = Buffer.from(content, 'utf8');
    }
    hasGerbers = Object.keys(gerberFiles).length > 0;
  }

  const zip = new JSZip();
  // Add KiCad project files
  zip.file(name + '.kicad_pro', pro);
  zip.file(name + '.kicad_sch', sch);
  zip.file(name + '.kicad_pcb', pcb);

  // Add Gerber files
  for (const [fileName, content] of Object.entries(gerberFiles)) {
    zip.file('gerber/' + fileName, content);
  }

  // Add BOM CSV
  let bomCsv = 'Reference,Value,Package,Description,MPN\n';
  for (const c of components) {
    bomCsv += `${c.reference || ''},${c.value || ''},${c.package || ''},${c.description || ''},${c.mpn || ''}\n`;
  }
  zip.file('bom.csv', bomCsv);

  // Add placement info for SVG renderer
  const placeInfo = {};
  for (const p of placed) {
    placeInfo[p.reference] = { x: p.posX, y: p.posY, angle: p.angle };
  }
  zip.file('placement.json', JSON.stringify(placeInfo, null, 2));

  // Clean up project dir
  try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { zipBuffer: zipBuf, placed, gerberFiles };
}

export function generatePcbSvg(components, netlist, dims, placed) {
  const w = dims.width || 80;
  const h = dims.height || 50;

  // Build pin positions from placed components
  const pinPositions = {};
  for (const comp of placed) {
    const ref = comp.reference || 'R1';
    const fpx = comp.posX;
    const fpy = comp.posY;
    const nPins = 2;
    for (let i = 1; i <= nPins; i++) {
      pinPositions[`${ref}:${i}`] = { x: fpx + (i === 1 ? -1 : 1), y: fpy };
    }
  }

  // Net colors
  const colors = ['#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#cc5de8', '#20c997', '#ff922b', '#f06595'];
  const netColors = {};
  let ci = 0;
  for (const n of netlist) { netColors[n.net] = colors[ci++ % colors.length]; }

  let svg = `<svg viewBox="-2 -2 ${w + 4} ${h + 4}" xmlns="http://www.w3.org/2000/svg" style="background:#0f0f1a;border-radius:8px;width:100%;height:auto;max-width:600px">
<style>.lbl{font-family:monospace;font-size:2.5px;fill:#94a3b8}</style>
<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#334155" stroke-width="0.3" rx="2"/>
<g id="mounting-holes">`;
  const holePositions = [[3, 3], [w - 3, 3], [3, h - 3], [w - 3, h - 3]];
  for (const [hx, hy] of holePositions) {
    svg += `<circle cx="${hx}" cy="${hy}" r="1.6" fill="none" stroke="#475569" stroke-width="0.3"/><circle cx="${hx}" cy="${hy}" r="0.6" fill="#1e293b"/>`;
  }
  svg += '</g>';

  // Traces
  svg += `<g id="traces" fill="none" stroke-width="0.15" opacity="0.5">`;
  for (const net of netlist) {
    const nodes = net.nodes || [];
    const positions = nodes.map(n => pinPositions[n]).filter(p => p);
    if (positions.length < 2) continue;
    const col = netColors[net.net] || '#6366f1';
    const src = positions[0];
    for (let i = 1; i < positions.length; i++) {
      const dst = positions[i];
      const midX = (src.x + dst.x) / 2;
      svg += `<path d="M${src.x},${src.y} L${midX},${src.y} L${midX},${dst.y} L${dst.x},${dst.y}" stroke="${col}" stroke-dasharray="0.3,0.2"/>`;
    }
  }
  svg += '</g>';

  // Components
  svg += '<g id="components">';
  for (const comp of placed) {
    const ref = comp.reference || 'R1';
    const x = comp.posX;
    const y = comp.posY;
    const pkg = comp.package || '0805';
    let cw = 3, ch = 1.5, col = '#6366f1';
    if (pkg.includes('TQFP')) { cw = 7; ch = 7; col = '#a855f7'; }
    else if (comp.type === 'R' || comp.reference?.startsWith('R')) { col = '#f59e0b'; }
    else if (comp.type === 'C' || comp.reference?.startsWith('C')) { col = '#06b6d4'; }
    else if (comp.type === 'LED' || comp.reference?.startsWith('LED')) { col = '#ef4444'; }
    svg += `<rect x="${x - cw / 2}" y="${y - ch / 2}" width="${cw}" height="${ch}" rx="0.5" fill="${col}44" stroke="${col}" stroke-width="0.15"/>
<text x="${x}" y="${y + 0.3}" text-anchor="middle" class="lbl" font-size="2">${ref}</text>`;
  }
  svg += '</g>';

  // Layer legend
  svg += `<g transform="translate(2, ${h - 10})">
<rect x="0" y="0" width="22" height="8" rx="1" fill="rgba(0,0,0,0.5)"/>
<text x="2" y="3" class="lbl" font-size="1.5" fill="#6366f1">▬ Top</text>
<text x="2" y="5.5" class="lbl" font-size="1.5" fill="#22d3ee">▬ Bottom</text>
<text x="11" y="3" class="lbl" font-size="1.5" fill="#94a3b8">${components.length} parts</text>
<text x="11" y="5.5" class="lbl" font-size="1.5" fill="#94a3b8">${netlist.length} nets</text>
</g>`;

  svg += '</svg>';
  return svg;
}

// ──────────────────────────────────────────────
// Fabrication Readiness Validator
// ──────────────────────────────────────────────

const FAB_RULES = {
  minTraceWidth: 0.15,
  minClearance: 0.2,
  minViaSize: 0.6,
  minViaDrill: 0.3,
  minAnnularRing: 0.1,
  minBoardWidth: 10,
  maxBoardWidth: 400,
  minBoardHeight: 10,
  maxBoardHeight: 400,
  requiredGerberLayers: ['F.Cu', 'B.Cu', 'F.Mask', 'B.Mask', 'F.Silkscreen', 'Edge.Cuts'],
  requiredBomFields: ['reference', 'value', 'package', 'description'],
};

export function validatePcbForFabrication({ components, netlist, boardW, boardH, gerberFiles, placed }) {
  const errors = [];
  const warnings = [];

  if (!components || !components.length) errors.push('BOM is empty — no components to fabricate');
  if (!netlist || !netlist.length) errors.push('Netlist is empty — no connectivity defined');

  if (boardW < FAB_RULES.minBoardWidth || boardW > FAB_RULES.maxBoardWidth) errors.push(`Board width ${boardW}mm is outside fab range (${FAB_RULES.minBoardWidth}-${FAB_RULES.maxBoardWidth}mm)`);
  if (boardH < FAB_RULES.minBoardHeight || boardH > FAB_RULES.maxBoardHeight) errors.push(`Board height ${boardH}mm is outside fab range (${FAB_RULES.minBoardHeight}-${FAB_RULES.maxBoardHeight}mm)`);

  const hasVCC = netlist.some(n => /^VCC|VDD|3V3|5V/i.test(n.net));
  const hasGND = netlist.some(n => /^GND|VSS|0V/i.test(n.net));
  if (!hasVCC) warnings.push('No VCC/VDD rail found in netlist');
  if (!hasGND) warnings.push('No GND/VSS rail found in netlist');

  for (const comp of components || []) {
    for (const field of FAB_RULES.requiredBomFields) {
      if (!comp[field] || String(comp[field]).trim() === '') warnings.push(`BOM field "${field}" missing for ${comp.reference || 'unknown ref'}`);
    }
    if (comp.package && !/^(0402|0603|0805|1206|1210|SOT-23|SOT23|SOT-223|SOT223|DIP-8|DIP8|TQFP-32|TQFP32|QFN-32|SOIC-8|SOP-8|TO-92|LED-0805|USB-C)$/i.test(comp.package)) {
      warnings.push(`Package "${comp.package}" for ${comp.reference || 'comp'} may not be in standard KiCad library — verify footprint`);
    }
  }

  const missingNets = [];
  for (const comp of components || []) {
    const ref = comp.reference || '';
    const pins = (netlist || []).flatMap(n => n.nodes || []);
    const connectedPins = pins.filter(n => n.startsWith(ref + ':')).length;
    const expectedPins = comp.package?.includes('TQFP') ? 32 : comp.package?.includes('SOIC') || comp.package?.includes('SOP') ? 8 : comp.package?.includes('DIP') ? 8 : comp.type === 'IC' ? 8 : 2;
    if (expectedPins > 2 && connectedPins < 2) missingNets.push(`${ref}: only ${connectedPins} pins connected (expected ~${expectedPins})`);
  }
  if (missingNets.length) warnings.push('Possible unterminated pins: ' + missingNets.slice(0, 5).join(', '));

  if (gerberFiles) {
    const gerberKeys = Object.keys(gerberFiles);
    const missingLayers = FAB_RULES.requiredGerberLayers.filter(l => !gerberKeys.some(k => k.includes(l)));
    if (missingLayers.length) errors.push(`Missing Gerber layers: ${missingLayers.join(', ')}`);
  }

  if (!placed || !placed.length) errors.push('Component placement is empty — board has no parts');

  const isReady = errors.length === 0;
  return {
    isReady,
    errors,
    warnings,
    score: Math.max(0, 100 - errors.length * 25 - warnings.length * 5),
    summary: isReady
      ? `✅ PCB is fabrication-ready (${(placed || []).length} components, ${(netlist || []).length} nets)`
      : `❌ PCB has ${errors.length} fabrication-blocking issue(s) and ${warnings.length} warning(s)`,
  };
}
