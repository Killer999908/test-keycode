// Probe: minimal circuit-json → kicad_pcb via circuit-json-to-kicad, validated by kicad-cli
import { CircuitJsonToKicadPcbConverter } from 'circuit-json-to-kicad';
import fs from 'fs';
import { execSync } from 'child_process';

const circuitJson = [
  { type: 'source_project', name: 'probe' },
  { type: 'source_component', source_component_id: 'sc_1', name: 'R1', ftype: 'simple_resistor', resistance: '10k' },
  { type: 'source_component', source_component_id: 'sc_2', name: 'C1', ftype: 'simple_capacitor', capacitance: '100nF' },
  { type: 'source_port', source_port_id: 'sp_1', source_component_id: 'sc_1', name: 'pin1', pin_number: 1 },
  { type: 'source_port', source_port_id: 'sp_2', source_component_id: 'sc_1', name: 'pin2', pin_number: 2 },
  { type: 'source_port', source_port_id: 'sp_3', source_component_id: 'sc_2', name: 'pin1', pin_number: 1 },
  { type: 'source_port', source_port_id: 'sp_4', source_component_id: 'sc_2', name: 'pin2', pin_number: 2 },
  { type: 'source_net', source_net_id: 'sn_1', name: 'GND', connected_ports: ['sp_2', 'sp_3'] },
  { type: 'source_net', source_net_id: 'sn_2', name: 'SIG', connected_ports: ['sp_1', 'sp_4'] },
  // PCB layer: placed components + ports
  { type: 'pcb_component', pcb_component_id: 'pc_1', source_component_id: 'sc_1', center: { x: 0, y: 0 }, width: 3.2, height: 1.6, layer: 'top', rotation: 0, footprint: 'res0603' },
  { type: 'pcb_component', pcb_component_id: 'pc_2', source_component_id: 'sc_2', center: { x: 10, y: 0 }, width: 3.2, height: 1.6, layer: 'top', rotation: 0, footprint: 'cap0603' },
  { type: 'pcb_port', pcb_port_id: 'pp_1', source_port_id: 'sp_1', pcb_component_id: 'pc_1', x: -1.2, y: 0, layers: ['top'] },
  { type: 'pcb_port', pcb_port_id: 'pp_2', source_port_id: 'sp_2', pcb_component_id: 'pc_1', x: 1.2, y: 0, layers: ['top'] },
  { type: 'pcb_port', pcb_port_id: 'pp_3', source_port_id: 'sp_3', pcb_component_id: 'pc_2', x: 8.8, y: 0, layers: ['top'] },
  { type: 'pcb_port', pcb_port_id: 'pp_4', source_port_id: 'sp_4', pcb_component_id: 'pc_2', x: 11.2, y: 0, layers: ['top'] },
  // Board outline
  { type: 'pcb_board', pcb_board_id: 'pb_1', width: 30, height: 20, center: { x: 5, y: 0 }, thickness: 1.6, num_layers: 2 },
];

try {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson);
  converter.runUntilFinished();
  const out = converter.getOutputString();
  fs.mkdirSync('/tmp/c2k-probe', { recursive: true });
  fs.writeFileSync('/tmp/c2k-probe/probe.kicad_pcb', out, 'utf8');
  console.log('CONVERTED OK —', out.length, 'bytes');
  console.log('--- first 400 chars ---');
  console.log(out.slice(0, 400));
} catch (e) {
  console.log('CONVERT ERROR:', e.message);
  process.exit(1);
}

try {
  const r = execSync('kicad-cli pcb export gerbers --output /tmp/c2k-probe/gerbers /tmp/c2k-probe/probe.kicad_pcb', { encoding: 'utf8', timeout: 60000 });
  console.log('KICAD-CLI OK');
  console.log(execSync('ls /tmp/c2k-probe/gerbers', { encoding: 'utf8' }));
} catch (e) {
  console.log('KICAD-CLI FAIL:', String(e.stderr || e.message).slice(0, 500));
}
