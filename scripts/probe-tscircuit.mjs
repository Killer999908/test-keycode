// Probe 2: tscircuit → circuit-json → kicad → kicad-cli gerbers + drill
import React from 'react';
import fs from 'fs';
import { execSync } from 'child_process';

async function main() {
  const { RootCircuit } = await import('@tscircuit/core');

  const circuit = new RootCircuit();
  const h = React.createElement;

  const board = h('board', { width: '30mm', height: '20mm' },
    h('resistor', { name: 'R1', resistance: '10k', footprint: '0603', connections: { pin1: 'net.VCC', pin2: 'C1.pin1' } }),
    h('capacitor', { name: 'C1', capacitance: '100nF', footprint: '0603', connections: { pin1: 'net.GND', pin2: 'R1.pin1' } }),
    h('led', { name: 'LED1', footprint: '0603', connections: { pin1: 'net.GND', pin2: 'R1.pin2' } }),
  );

  circuit.add(board);
  await circuit.renderUntilSettled();

  const circuitJson = circuit.getCircuitJson();
  fs.mkdirSync('/tmp/tsc-probe', { recursive: true });
  fs.writeFileSync('/tmp/tsc-probe/circuit.json', JSON.stringify(circuitJson, null, 2));
  console.log('CIRCUIT JSON OK —', circuitJson.length, 'elements');

  const types = {};
  for (const el of circuitJson) types[el.type] = (types[el.type] || 0) + 1;
  console.log('Element types:', JSON.stringify(types));

  const { CircuitJsonToKicadPcbConverter } = await import('circuit-json-to-kicad');
  const conv = new CircuitJsonToKicadPcbConverter(circuitJson);
  conv.runUntilFinished();
  const pcb = conv.getOutputString();
  fs.writeFileSync('/tmp/tsc-probe/probe.kicad_pcb', pcb, 'utf8');
  console.log('KICAD PCB OK —', pcb.length, 'bytes');

  execSync('rm -rf /tmp/tsc-probe/gerbers /tmp/tsc-probe/drill');
  execSync('kicad-cli pcb export gerbers --output /tmp/tsc-probe/gerbers /tmp/tsc-probe/probe.kicad_pcb', { timeout: 60000 });
  execSync('kicad-cli pcb export drill --output /tmp/tsc-probe/drill --format excellon /tmp/tsc-probe/probe.kicad_pcb', { timeout: 60000 });
  console.log('GERBERS OK');
  const files = execSync('ls /tmp/tsc-probe/gerbers', { encoding: 'utf8' }).trim().split('\n');
  console.log('Gerber files:', files.length);
  const fcu = fs.readFileSync('/tmp/tsc-probe/gerbers/probe-F_Cu.gtl', 'utf8');
  console.log('F.Cu flashes (pads):', (fcu.match(/D03\*/g) || []).length);
  console.log('F.Cu draws (traces):', (fcu.match(/D01\*/g) || []).length);
  console.log('Drill files:', execSync('ls /tmp/tsc-probe/drill', { encoding: 'utf8' }).trim());
}

main().catch(e => { console.log('FAIL:', e.message); process.exit(1); });
