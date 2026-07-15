import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import JSZip from 'jszip';

const generatedDir = path.join(process.cwd(), 'generated');
const exportsDir = path.join(process.cwd(), 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

function readGenFile(fileId) {
  const fp = path.join(generatedDir, fileId.replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
  if (!fs.existsSync(fp)) throw new Error('File not found: ' + fileId);
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

// ── KiCad S-expression generators ──

function escStr(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

function genKicadPro(name) {
  return `(kicad_sch (version 20240126) (generator "KEYCODE")
  (paper "A4")
  (title_block
    (title ${escStr(name)})
    (date "${new Date().toISOString().split('T')[0]}")
    (rev "1.0")
    (company "KEYCODE AI")
  )
)`;
}

function genKicadSch(data) {
  const { bom = [], netlist = [] } = data;
  const lines = [];
  lines.push(`(kicad_sch (version 20240126) (generator "KEYCODE")`);
  lines.push(`  (paper "A4")`);

  // lib_symbols — minimal built-in symbols
  const libSymbols = new Set();
  for (const c of bom) {
    const ref = (c.ref || 'R1').replace(/[0-9]/g, '');
    if (ref === 'R') libSymbols.add('R');
    else if (ref === 'C') libSymbols.add('C');
    else if (ref === 'L') libSymbols.add('L');
    else if (ref === 'D') libSymbols.add('D');
    else if (ref === 'Q') libSymbols.add('Q');
    else if (ref === 'U') libSymbols.add('U');
    else libSymbols.add('U');
  }

  lines.push(`  (lib_symbols`);
  for (const sym of libSymbols) {
    if (sym === 'R') {
      lines.push(`    (symbol "R" (pin_names (offset 0)) (in_bom yes) (on_board yes)
      (property "Reference" "R" (id 0) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (id 1) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (symbol "${escStr("R_0_1")}"
        (rectangle (start -2.54 1.27) (end 2.54 -1.27) (stroke (width 0.254) (type default) (color 0 0 0 0)) (fill (type none)))
        (pin passive (at -5.08 0 0) (length 2.54) (name "1" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive (at 5.08 0 0) (length 2.54) (name "2" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )`);
    } else if (sym === 'C') {
      lines.push(`    (symbol "C" (pin_names (offset 0)) (in_bom yes) (on_board yes)
      (property "Reference" "C" (id 0) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "C" (id 1) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (symbol "${escStr("C_0_1")}"
        (rectangle (start -2.54 1.27) (end 2.54 -1.27) (stroke (width 0.254) (type default) (color 0 0 0 0)) (fill (type none)))
        (pin passive (at -5.08 0 0) (length 2.54) (name "1" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive (at 5.08 0 0) (length 2.54) (name "2" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )`);
    } else {
      lines.push(`    (symbol "U" (pin_names (offset 0)) (in_bom yes) (on_board yes)
      (property "Reference" "U" (id 0) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "U" (id 1) (at 0 0 0) (effects (font (size 1.27 1.27))))
      (symbol "${escStr("U_0_1")}"
        (rectangle (start -3.81 3.81) (end 3.81 -3.81) (stroke (width 0.254) (type default) (color 0 0 0 0)) (fill (type none)))
        (pin passive (at -5.08 0 0) (length 1.27) (name "1" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive (at 5.08 0 0) (length 1.27) (name "2" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
        (pin passive (at -5.08 2.54 0) (length 1.27) (name "3" (effects (font (size 1.27 1.27)))) (number "3" (effects (font (size 1.27 1.27)))))
        (pin passive (at 5.08 2.54 0) (length 1.27) (name "4" (effects (font (size 1.27 1.27)))) (number "4" (effects (font (size 1.27 1.27)))))
      )
    )`);
    }
  }
  lines.push(`  )`);

  // Symbol instances on sheet
  lines.push(`  (symbol (lib_id "Device:R") (at 50.8 50.8 0) (unit 1)`);
  lines.push(`    (property "Reference" "R1" (id 0) (at 50.8 40.64 0) (effects (font (size 1.27 1.27)) (justify left)))`);
  lines.push(`    (property "Value" "10k" (id 1) (at 50.8 63.5 0) (effects (font (size 1.27 1.27)) (justify left)))`);
  lines.push(`  )`);

  let x = 100, y = 50;
  let netId = 1;
  const netMap = {};

  for (const comp of bom) {
    const ref = comp.ref || `U${bom.indexOf(comp)+1}`;
    const prefix = ref.replace(/[0-9]/g, '');
    const symLibId = prefix === 'R' ? 'Device:R' : prefix === 'C' ? 'Device:C' : 'Device:U';
    lines.push(`  (symbol (lib_id ${escStr(symLibId)}) (at ${x} ${y} 0) (unit 1)
    (property "Reference" ${escStr(ref)} (id 0) (at ${x} ${y - 10} 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Value" ${escStr(comp.value || comp.mpn || '')} (id 1) (at ${x} ${y + 12} 0) (effects (font (size 1.27 1.27)) (justify left)))
  )`);
    x += 60;
    if (x > 350) { x = 50; y += 60; }
  }

  // Net labels and wires
  for (const net of netlist) {
    if (!net.net || !net.nodes) continue;
    const nId = netId++;
    netMap[net.net] = nId;
    let nx = 50, ny = y + 80;
    for (const node of net.nodes) {
      const parts = node.split('-');
      if (parts.length < 2) continue;
      lines.push(`  (label ${escStr(net.net)} (at ${nx} ${ny} 0) (fields (justify left)) (effects (font (size 1.27 1.27)))`);
      lines.push(`  )`);
      nx += 40;
      if (nx > 350) { nx = 50; ny += 20; }
    }
  }

  // Wire connections
  for (const net of netlist) {
    if (!net.nodes || net.nodes.length < 2) continue;
    const nId = netMap[net.net] || 1;
    let wx = 120, wy = y + 100;
    for (let i = 1; i < net.nodes.length; i++) {
      lines.push(`  (wire (pts (xy ${wx - 40} ${wy}) (xy ${wx} ${wy})) (stroke (width 0) (type default) (color 0 0 0 0)) (net ${nId}))`);
      wx += 30;
    }
  }

  lines.push(`)`);
  return lines.join('\n');
}

function genKicadPcb(data) {
  const { bom = [], board_dimensions = '100x100mm' } = data;
  const dimMatch = board_dimensions.match(/([\d.]+)\s*x\s*([\d.]+)/);
  const bw = parseFloat(dimMatch?.[1] || 100);
  const bh = parseFloat(dimMatch?.[2] || 100);

  const lines = [];
  lines.push(`(kicad_pcb (version 20240126) (generator "KEYCODE")`);
  lines.push(`  (general`);
  lines.push(`    (thickness 1.6)`);
  lines.push(`  )`);
  lines.push(`  (paper "A4")`);
  lines.push(`  (layers`);
  lines.push(`    (0 "F.Cu" (signal))`);
  lines.push(`    (31 "B.Cu" (signal))`);
  lines.push(`    (32 "B.Adhes" (user))`);
  lines.push(`    (33 "F.Adhes" (user))`);
  lines.push(`    (34 "B.Paste" (user))`);
  lines.push(`    (35 "F.Paste" (user))`);
  lines.push(`    (36 "B.SilkS" (user))`);
  lines.push(`    (37 "F.SilkS" (user))`);
  lines.push(`    (38 "B.Mask" (user))`);
  lines.push(`    (39 "F.Mask" (user))`);
  lines.push(`    (40 "Dwgs.User" (user))`);
  lines.push(`    (41 "Cmts.User" (user))`);
  lines.push(`    (42 "Eco1.User" (user))`);
  lines.push(`    (43 "Eco2.User" (user))`);
  lines.push(`    (44 "Edge.Cuts" (user))`);
  lines.push(`  )`);

  // Board outline
  lines.push(`  (segment (start 0 0) (end ${bw} 0) (width 0.15) (layer "Edge.Cuts") (net 0))`);
  lines.push(`  (segment (start ${bw} 0) (end ${bw} ${bh}) (width 0.15) (layer "Edge.Cuts") (net 0))`);
  lines.push(`  (segment (start ${bw} ${bh}) (end 0 ${bh}) (width 0.15) (layer "Edge.Cuts") (net 0))`);
  lines.push(`  (segment (start 0 ${bh}) (end 0 0) (width 0.15) (layer "Edge.Cuts") (net 0))`);

  // Footprint instances
  let fx = 20, fy = 20;
  for (const comp of bom) {
    const ref = comp.ref || `U${bom.indexOf(comp)+1}`;
    const pkg = comp.package || '0603';
    lines.push(`  (footprint ${escStr("Resistor_SMD:R_" + pkg)} (layer "F.Cu")`);
    lines.push(`    (at ${fx} ${fy} 0)`);
    lines.push(`    (property "Reference" ${escStr(ref)} (id 0) (at ${fx} ${fy - 5} 0) (effects (font (size 1 1) (thickness 0.15))))`);
    lines.push(`    (property "Value" ${escStr(comp.value || '')} (id 1) (at ${fx} ${fy + 5} 0) (effects (font (size 1 1) (thickness 0.15))))`);
    lines.push(`  )`);
    fx += 15;
    if (fx > bw - 20) { fx = 20; fy += 15; }
  }

  lines.push(`)`);
  return lines.join('\n');
}

function genBomCsv(data) {
  const { bom = [] } = data;
  const header = 'Ref,Value,Package,Qty,Description,MPN,Manufacturer';
  const rows = bom.map(c =>
    `${c.ref || ''},${c.value || ''},${c.package || ''},${c.qty || 1},${c.description || ''},${c.mpn || ''},${c.manufacturer || ''}`
  );
  return header + '\n' + rows.join('\n');
}

function genNetlistCsv(data) {
  const { netlist = [] } = data;
  const header = 'Net,Nodes,Voltage,Current';
  const rows = netlist.map(n =>
    `${n.net || ''},"${(n.nodes || []).join('; ')}",${n.voltage || ''},${n.current || ''}`
  );
  return header + '\n' + rows.join('\n');
}

// ── FreeCAD Python Script Generator ──

function genFreeCADScript(data) {
  const { openscad = '', summary = '', dimensions = '', materials = '' } = data;
  return `# FreeCAD Python Macro — Generated by KEYCODE AI
# ${summary}
# Dimensions: ${dimensions}
# Materials: ${materials}
# Run: Open FreeCAD → Macro → Macros... → Execute

import FreeCAD
import Part
import Draft
import Mesh

doc = FreeCAD.newDocument("KEYCODE_Design")

# ════════════════════════════════════════
# Design generated from AI specification
# Paste OpenSCAD code below as reference
# ════════════════════════════════════════

"""
OpenSCAD Reference Code:
${openscad.split('\n').map(l => '  ' + l).join('\n')}
"""

# Helper: create box
def make_box(name, x, y, z, w, d, h):
    obj = doc.addObject("Part::Box", name)
    obj.Length = w
    obj.Width = d
    obj.Height = h
    obj.Placement.Base = FreeCAD.Vector(x, y, z)
    return obj

# Helper: create cylinder
def make_cylinder(name, x, y, z, r, h):
    obj = doc.addObject("Part::Cylinder", name)
    obj.Radius = r
    obj.Height = h
    obj.Placement.Base = FreeCAD.Vector(x, y, z)
    return obj

# ════════════════════════════════════════════════════
# MAIN MODEL — Edit below to match your design intent
# ════════════════════════════════════════════════════

# Base body
body = make_box("Base", 0, 0, 0, 80, 60, 20)
body.ViewObject.ShapeColor = (0.8, 0.8, 0.8)

# Cutout example
cutout = make_cylinder("Cutout", 40, 30, -1, 10, 22)
cut = doc.addObject("Part::Cut", "BaseCut")
cut.Base = body
cut.Tool = cutout

# Chamfer example
chamfer = doc.addObject("Part::Chamfer", "Chamfer")
chamfer.Base = cut
chamfer.Size = 2.0
chamfer.Edges = [(e, 2.0) for e in range(12)]

doc.recompute()
FreeCADGui.SendMsgToActiveView("ViewFit")
`;
}

// ── Blender Python Script Generator ──

function genBlenderScript(data) {
  const { openscad = '', summary = '', dimensions = '', materials = '' } = data;
  return `# Blender Python Script — Generated by KEYCODE AI
# ${summary}
# Dimensions: ${dimensions}
# Materials: ${materials}
# Run: Blender → Scripting → New → Paste → Run Script

import bpy
import math

# Clear existing scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

"""
OpenSCAD Reference Code:
${openscad.split('\n').map(l => '  ' + l).join('\n')}
"""

# ── Materials ──
def make_material(name, color=(0.8, 0.8, 0.8, 1.0), roughness=0.3, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

mat_body = make_material("Body", (0.2, 0.4, 0.8, 1.0), 0.2, 0.1)
mat_accent = make_material("Accent", (0.9, 0.7, 0.1, 1.0), 0.5, 0.3)

# ── Main Body ──
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
body = bpy.context.active_object
body.scale = (4, 3, 1)
body.name = "Body"
if body.data.materials:
    body.data.materials[0] = mat_body
else:
    body.data.materials.append(mat_body)

# Apply scale
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.ops.object.transform_apply(scale=True)

# ── Cylinder Detail ──
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=0.5, location=(1.5, 0, 1.5))
detail = bpy.context.active_object
detail.name = "Detail"
if detail.data.materials:
    detail.data.materials[0] = mat_accent
else:
    detail.data.materials.append(mat_accent)

# ── Bevel edges ──
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.bevel(offset=0.05, segments=4)
bpy.ops.object.mode_set(mode='OBJECT')

# ── Lighting ──
bpy.ops.object.light_add(type='AREA', location=(5, 5, 8))
area = bpy.context.active_object
area.data.energy = 500

bpy.ops.object.light_add(type='AREA', location=(-5, -5, 4))
fill = bpy.context.active_object
fill.data.energy = 200

# ── Camera ──
bpy.ops.object.camera_add(location=(6, -5, 4))
cam = bpy.context.active_object
cam.rotation_euler = (math.radians(60), 0, math.radians(40))
bpy.context.scene.camera = cam

print("✅ Model created successfully");
`;
}

// ── LTspice .asc Generator ──

function genLTspice(data) {
  const { netlist = [], bom = [] } = data;
  let lines = [];
  lines.push(`Version 4`);
  lines.push(`SHEET 1 880 680`);
  lines.push(``);

  let x = 160, y = 256;
  let symCount = 0;

  for (const comp of bom) {
    const ref = comp.ref || `U${symCount + 1}`;
    const val = comp.value || comp.mpn || '10k';
    const prefix = ref.replace(/[0-9]/g, '').toUpperCase();

    if (prefix === 'R') {
      lines.push(`SYMBOL res ${x} ${y} R0`);
      lines.push(`SYMATTR InstName ${ref}`);
      lines.push(`SYMATTR Value ${val}`);
    } else if (prefix === 'C') {
      lines.push(`SYMBOL cap ${x} ${y} R0`);
      lines.push(`SYMATTR InstName ${ref}`);
      lines.push(`SYMATTR Value ${val}`);
    } else if (prefix === 'L') {
      lines.push(`SYMBOL ind ${x} ${y} R0`);
      lines.push(`SYMATTR InstName ${ref}`);
      lines.push(`SYMATTR Value ${val}`);
    } else if (prefix === 'D') {
      lines.push(`SYMBOL diode ${x} ${y} R0`);
      lines.push(`SYMATTR InstName ${ref}`);
      lines.push(`SYMATTR Value ${val}`);
    } else if (prefix === 'Q') {
      lines.push(`SYMBOL npn ${x} ${y} R0`);
      lines.push(`SYMATTR InstName ${ref}`);
      lines.push(`SYMATTR Value ${val}`);
    } else {
      lines.push(`SYMBOL voltage ${x} ${y} R0`);
      lines.push(`SYMATTR InstName ${ref}`);
      lines.push(`SYMATTR Value ${val}`);
    }
    lines.push(``);
    symCount++;
    x += 120;
    if (x > 760) { x = 160; y += 80; }
  }

  // Wire connections based on netlist
  let wx = 180, wy = y + 100;
  for (const net of netlist) {
    if (!net.nodes || net.nodes.length < 2) continue;
    lines.push(`WIRE ${wx} ${wy} ${wx + 60} ${wy}`);
    wx += 80;
    if (wx > 760) { wx = 180; wy += 40; }
  }

  // Analysis directive
  lines.push(`TEXT 24 24 Left 2 !.tran 10m startup`);
  lines.push(`TEXT 24 48 Left 2 !.plot V(1)`);

  return lines.join('\n');
}

// ── Qucs-S .sch Generator ──

function genQucsSch(data) {
  const { netlist = [], bom = [] } = data;
  let lines = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push('<Qucs Schematic >');
  lines.push(`  <Properties>`);
  lines.push(`    <Property="Grid"="10"/>`);
  lines.push(`    <Property="Dataset"="KEYCODE_Simulation"/>`);
  lines.push(`  </Properties>`);
  lines.push(`  <Symbol>`);
  lines.push(`  </Symbol>`);
  lines.push(`  <Components>`);

  for (const comp of bom) {
    const ref = comp.ref || `U${bom.indexOf(comp)+1}`;
    const val = comp.value || comp.mpn || '10k';
    const prefix = ref.replace(/[0-9]/g, '').toUpperCase();

    if (prefix === 'R') {
      lines.push(`    <R ${ref} 1 2 100 100 0 0 "R" "${val}" 1 "26.85" "0" "european"/>`);
    } else if (prefix === 'C') {
      lines.push(`    <C ${ref} 1 2 100 100 0 0 "C" "${val}" 1 "" "0" "european"/>`);
    } else if (prefix === 'L') {
      lines.push(`    <L ${ref} 1 2 100 100 0 0 "L" "${val}" 1 "" "0" "european"/>`);
    } else if (prefix === 'D') {
      lines.push(`    <D ${ref} 1 2 100 100 0 0 "D" "${val}" 1 "" "0" "1" "0" "0"/>`);
    } else if (prefix === 'Q') {
      lines.push(`    <BJT ${ref} 1 2 100 100 0 0 "npn" "${val}" 1 "1" "0" "0" "0" "0" "0" "0" "0" "0"/>`);
    } else if (prefix === 'U') {
      lines.push(`    <File ${ref} 1 2 100 100 0 0 "${val}" "1" "1" "0" "0" "0" "0" "0"/>`);
    } else {
      lines.push(`    <Vdc ${ref} 1 2 100 100 0 0 "${val}" "1" "" "0" "0" "0" "0" "0" "0"/>`);
    }
  }

  lines.push(`  </Components>`);
  lines.push(`  <Wires>`);
  let wx = 120, wy = 130;
  for (const net of netlist) {
    if (!net.nodes || net.nodes.length < 2) continue;
    lines.push(`    <${wx} ${wy} ${wx+50} ${wy} "" 0 0 0 "">`);
    wx += 60;
  }
  lines.push(`  </Wires>`);
  lines.push(`  <Diagrams>`);
  lines.push(`    <Plot></Plot>`);
  lines.push(`  </Diagrams>`);
  lines.push(`</Qucs Schematic>`);

  return lines.join('\n');
}

// ── Falstad Circuit URL Generator ──

function genFalstadUrl(data) {
  const { netlist = [], bom = [] } = data;
  // Falstad uses a compact text format compressed with base64
  // Format: components and connections encoded as text
  const parts = [];

  for (const comp of bom) {
    const ref = comp.ref || `U${bom.indexOf(comp)+1}`;
    const val = comp.value || comp.mpn || '10k';
    const prefix = ref.replace(/[0-9]/g, '').toUpperCase();

    if (prefix === 'R') parts.push(`r ${parts.length+1} 0 ${val}`);
    else if (prefix === 'C') parts.push(`c ${parts.length+1} 0 ${val}`);
    else if (prefix === 'L') parts.push(`l ${parts.length+1} 0 ${val}`);
    else if (prefix === 'D') parts.push(`d ${parts.length+1} 0`);
    else if (prefix === 'Q') parts.push(`t ${parts.length+1} 0`);
    else parts.push(`v ${parts.length+1} 0 5`);
  }

  // Wire connections
  let netIdx = 1;
  for (const net of netlist) {
    if (net.nodes && net.nodes.length > 1) {
      parts.push(`w ${netIdx} ${netIdx+1}`);
      netIdx++;
    }
  }

  // Ground
  parts.push(`g 0`);

  const circuitStr = parts.join(' ');
  const encoded = Buffer.from(circuitStr).toString('base64url');
  return `https://www.falstad.com/circuit/circuitjs.html?ctz=${encoded}`;
}

// ── Public API ──

export async function exportToKiCad(fileId) {
  const data = readGenFile(fileId);
  const zip = new JSZip();
  const name = fileId.replace(/[^a-zA-Z0-9_-]/g, '');

  zip.file(name + '.kicad_pro', genKicadPro(name));
  zip.file(name + '.kicad_sch', genKicadSch(data));
  zip.file(name + '.kicad_pcb', genKicadPcb(data));
  zip.file(name + '-bom.csv', genBomCsv(data));
  zip.file(name + '-netlist.csv', genNetlistCsv(data));

  const zipPath = path.join(exportsDir, name + '-kicad.zip');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(zipPath, buf);

  // Validate with kicad-cli if available
  try {
    const schPath = path.join(exportsDir, name + '.kicad_sch');
    fs.writeFileSync(schPath, genKicadSch(data));
    // ERC check
    try {
      execSync(`kicad-cli sch erc "${schPath}" --output "${exportsDir}/${name}-erc.txt" 2>/dev/null`, { timeout: 10000 });
    } catch {}
    fs.unlinkSync(schPath);
  } catch {}

  return { path: zipPath, filename: name + '-kicad.zip', contentType: 'application/zip' };
}

export function exportToFreeCAD(fileId) {
  const data = readGenFile(fileId);
  const script = genFreeCADScript(data);
  return { content: script, filename: fileId + '-freecad.py', contentType: 'text/x-python' };
}

export function exportToBlender(fileId) {
  const data = readGenFile(fileId);
  const script = genBlenderScript(data);
  return { content: script, filename: fileId + '-blender.py', contentType: 'text/x-python' };
}

export function exportToLTspice(fileId) {
  const data = readGenFile(fileId);
  const content = genLTspice(data);
  return { content, filename: fileId + '.asc', contentType: 'text/plain' };
}

export function exportToQucs(fileId) {
  const data = readGenFile(fileId);
  const content = genQucsSch(data);
  return { content, filename: fileId + '-qucs.sch', contentType: 'application/xml' };
}

export function exportToFalstad(fileId) {
  const data = readGenFile(fileId);
  const url = genFalstadUrl(data);
  return { content: url, filename: fileId + '-falstad-url.txt', contentType: 'text/plain' };
}

// ── 3D STL via CadQuery ──

export function exportToSTL(fileId) {
  const data = readGenFile(fileId);
  const outputPath = path.join(exportsDir, fileId + '.stl');

  // Generate CadQuery script based on result type
  let script;
  if (data.type === 'pcb' || data.type === 'circuit') {
    // Generate a simple 3D PCB model
    const w = parseFloat(data.width) || 80;
    const h = parseFloat(data.height) || 50;
    const t = 1.6;
    script = `
import cadquery as cq
board = cq.Workplane("XY").box(${w}, ${h}, ${t})
# Add some component blobs
for x, y in [(${w*0.3},${h*0.3}), (${w*0.7},${h*0.5}), (${w*0.5},${h*0.7})]:
    board = board.cut(cq.Workplane("XY").circle(2).extrude(${t}).translate((x, y, 0)))
cq.exporters.export(board, "${outputPath}")
`;
  } else if (data.type === 'mechanical' || data.type === '3d') {
    // Generate 3D mechanical part from description
    const d = parseFloat(data.dimensions) || 60;
    script = `
import cadquery as cq
result = cq.Workplane("XY").box(${d}, ${d}, ${d})
# Add rounded edges
result = result.edges().fillet(2)
cq.exporters.export(result, "${outputPath}")
`;
  } else {
    const d = 40;
    script = `
import cadquery as cq
result = cq.Workplane("XY").box(${d}, ${d}, ${d})
cq.exporters.export(result, "${outputPath}")
`;
  }

  const tmpFile = path.join(generatedDir, `_cq_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, script);
  try {
    execSync(`python3 "${tmpFile}"`, { timeout: 30000, stdio: 'pipe' });
    return { content: fs.readFileSync(outputPath, 'base64'), filename: fileId + '.stl', contentType: 'model/stl' };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
