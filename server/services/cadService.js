// CadQuery 3D model generator — runs server-side, outputs STL for browser preview

import * as fs from 'fs';
import * as path from 'path';

export async function generateSTL(params) {
  const { type, dimensions } = params;
  const outputPath = path.resolve('generated', `${params.fileId || 'model'}.stl`);

  switch (type) {
    case 'enclosure':
      await enclosure(params, outputPath);
      break;
    case 'bracket':
      await bracket(params, outputPath);
      break;
    case 'cylinder':
      await cylinder(params, outputPath);
      break;
    case 'custom':
      await custom(params, outputPath);
      break;
    default:
      throw new Error(`Unknown 3D type: ${type}`);
  }

  return outputPath;
}

async function enclosure(params, outputPath) {
  const l = parseFloat(params.length) || 100;
  const w = parseFloat(params.width) || 60;
  const h = parseFloat(params.height) || 40;
  const t = parseFloat(params.thickness) || 2;

  const script = `
import cadquery as cq

box = cq.Workplane("XY").box(${l}, ${w}, ${h})
shell = box.faces("<Z").shell(-${t})
cq.exporters.export(shell, "${outputPath}")
`;
  await runCadQuery(script);
}

async function bracket(params, outputPath) {
  const l = parseFloat(params.length) || 80;
  const h = parseFloat(params.height) || 50;
  const t = parseFloat(params.thickness) || 5;

  const script = `
import cadquery as cq

result = (
  cq.Workplane("XY")
  .hLine(${l})
  .line(-${l / 4}, ${h})
  .line(-${l / 2}, 0)
  .close()
  .extrude(${t})
)
cq.exporters.export(result, "${outputPath}")
`;
  await runCadQuery(script);
}

async function cylinder(params, outputPath) {
  const r = parseFloat(params.radius) || 25;
  const h = parseFloat(params.height) || 60;

  const script = `
import cadquery as cq

result = cq.Workplane("XY").circle(${r}).extrude(${h})
cq.exporters.export(result, "${outputPath}")
`;
  await runCadQuery(script);
}

async function custom(params, outputPath) {
  // Run user-provided CadQuery script
  const script = params.script || `
import cadquery as cq
result = cq.Workplane("XY").box(50, 50, 50)
cq.exporters.export(result, "${outputPath}")
`;
  await runCadQuery(script);
}

async function runCadQuery(script) {
  const { execSync } = await import('child_process');
  const tmpFile = path.resolve('generated', `_cq_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, script);
  try {
    execSync(`python3 "${tmpFile}"`, { timeout: 30000, stdio: 'pipe' });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
