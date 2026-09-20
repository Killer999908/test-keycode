// Probe 3: kicadExportService with a realistic AI-generated ESP32 BOM/netlist
import { generateRealKicadProject } from '../server/services/kicadExportService.js';
import fs from 'fs';

const bom = [
  { reference: 'U1', value: 'ESP32-WROOM-32E', package: 'QFN-32', description: 'WiFi MCU module', mpn: 'ESP32-WROOM-32E-N8' },
  { reference: 'U2', value: 'SHT30', package: 'SOIC-8', description: 'Temp/humidity sensor', mpn: 'SHT30-DIS-B' },
  { reference: 'U3', value: 'AMS1117-3.3', package: 'SOT-223', description: '3.3V LDO', mpn: 'AMS1117-3.3' },
  { reference: 'J1', value: 'USB-C', package: 'USB-C', description: 'Power connector', mpn: 'TYPE-C-31-M-12' },
  { reference: 'C1', value: '10uF', package: '0805', description: 'Input cap', mpn: 'GRM21BR61E106KA73L' },
  { reference: 'C2', value: '100nF', package: '0402', description: 'Decoupling', mpn: 'GRM155R71C104KA88' },
  { reference: 'R1', value: '10k', package: '0402', description: 'I2C pullup', mpn: 'RC0402FR-0710KL' },
  { reference: 'R2', value: '10k', package: '0402', description: 'I2C pullup', mpn: 'RC0402FR-0710KL' },
];

// Deliberately mixed node formats: dash, colon, alpha — exactly what the AI produces
const netlist = [
  { net: 'VBUS', nodes: ['J1-1', 'U3-3', 'C1-1'] },
  { net: '3V3', nodes: ['U3:2', 'U1-1', 'U2-1', 'C2-1', 'R1-1', 'R2-1'] },
  { net: 'GND', nodes: ['J1-2', 'U3-1', 'U1-2', 'U2-2', 'C1-2', 'C2-2'] },
  { net: 'SDA', nodes: ['U1-3', 'U2-3', 'R1-2'] },
  { net: 'SCL', nodes: ['U1-4', 'U2-4', 'R2-2'] },
];

const t0 = Date.now();
try {
  const result = await generateRealKicadProject({
    name: 'ESP32_TEMP_NODE',
    bom,
    netlist,
    boardW: 50,
    boardH: 35,
  });
  console.log('✅ SUCCESS in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log('kicadValidated:', result.kicadValidated);
  console.log('gerber layers:', result.gerberCount, '| drill:', result.hasDrill);
  console.log('summary:', result.summary);
  console.log('files:', Object.keys(result.files).length);
  const fcu = result.files['ESP32_TEMP_NODE-F_Cu.gtl'] || result.files['ESP32_TEMP_NODE-F_Cu.gbr'] || Object.entries(result.files).find(([k]) => k.includes('F_Cu'))?.[1];
  if (fcu) {
    const s = fcu.toString();
    console.log('F.Cu pad flashes:', (s.match(/D03\*/g) || []).length);
    console.log('F.Cu trace draws:', (s.match(/D01\*/g) || []).length);
  }
  // Persist for manual inspection
  fs.mkdirSync('/tmp/kicad-svc-out', { recursive: true });
  for (const [k, v] of Object.entries(result.files)) fs.writeFileSync('/tmp/kicad-svc-out/' + k, v);
  console.log('saved to /tmp/kicad-svc-out');
} catch (e) {
  console.log('❌ FAIL after', ((Date.now() - t0) / 1000).toFixed(1), 's:', e.message);
  process.exit(1);
}
