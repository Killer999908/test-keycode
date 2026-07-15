// OpenSCAD service — renders 3D models server-side, outputs STL

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const generatedDir = path.join(process.cwd(), 'generated');
const exportsDir = path.join(process.cwd(), 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

export function renderSTL(openscadCode, fileId) {
  const tmpScad = path.join(generatedDir, `_openscad_${Date.now()}.scad`);
  const outputPath = path.join(exportsDir, `${fileId}.stl`);

  fs.writeFileSync(tmpScad, openscadCode);

  try {
    execSync(`openscad -o "${outputPath}" "${tmpScad}"`, {
      timeout: 60000,
      stdio: 'pipe',
    });
    return outputPath;
  } catch (e) {
    throw new Error(`OpenSCAD failed: ${e.stderr || e.message}`);
  } finally {
    try { fs.unlinkSync(tmpScad); } catch {}
  }
}

// Generate OpenSCAD code from parameters
export function generateOpenscad(params) {
  const { type, dimensions, fileId } = params;
  const outputPath = path.join(exportsDir, `${fileId}.stl`);

  switch (type) {
    case 'enclosure':
      return genEnclosure(params, outputPath);
    case 'bracket':
      return genBracket(params, outputPath);
    case 'cylinder':
      return genCylinder(params, outputPath);
    case 'pcb':
      return genPCB3D(params, outputPath);
    default:
      return genBasic(params, outputPath);
  }
}

function genEnclosure(p, out) {
  const l = parseFloat(p.length) || 100;
  const w = parseFloat(p.width) || 60;
  const h = parseFloat(p.height) || 40;
  const t = parseFloat(p.thickness) || 2;
  return `
$fn = 64;
difference() {
    cube([${l}, ${w}, ${h}], center = true);
    translate([0, 0, ${t/2}])
        cube([${l - t*2}, ${w - t*2}, ${h - t}], center = true);
}
`;
}

function genBracket(p, out) {
  const l = parseFloat(p.length) || 80;
  const h = parseFloat(p.height) || 50;
  const t = parseFloat(p.thickness) || 5;
  return `
$fn = 32;
linear_extrude(height = ${t}) {
    polygon(points = [[0,0], [${l},0], [${l*0.75},${h}], [${l*0.25},${h}]]);
}
`;
}

function genCylinder(p, out) {
  const r = parseFloat(p.radius) || 25;
  const h = parseFloat(p.height) || 60;
  return `
$fn = 64;
cylinder(r = ${r}, h = ${h}, center = true);
`;
}

function genPCB3D(p, out) {
  const w = parseFloat(p.width) || 80;
  const h = parseFloat(p.height) || 50;
  const t = parseFloat(p.thickness) || 1.6;
  return `
$fn = 32;
// PCB Board
color("green") cube([${w}, ${h}, ${t}], center = true);
// Some IC footprints
translate([${w*0.3}, ${h*0.3}, ${t/2 + 1}])
    color("gray") cube([8, 8, 2], center = true);
translate([${-w*0.3}, ${-h*0.3}, ${t/2 + 1}])
    color("gray") cube([6, 6, 1.5], center = true);
translate([${w*0.35}, ${-h*0.35}, ${t/2 + 0.5}])
    color("silver") cube([4, 4, 1], center = true);
`;
}

function genBasic(p, out) {
  const d = parseFloat(p.dimensions) || 40;
  return `
$fn = 64;
cube([${d}, ${d}, ${d}], center = true);
`;
}
