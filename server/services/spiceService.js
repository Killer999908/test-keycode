// ngspice circuit simulation service — runs real SPICE server-side

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const generatedDir = path.join(process.cwd(), 'generated');

export function runSimulation(netlist, options = {}) {
  const { type = 'dc', analysis = '' } = options;
  const tmpNetlist = path.join(generatedDir, `_spice_${Date.now()}.cir`);
  const tmpOut = path.join(generatedDir, `_spice_${Date.now()}.out`);

  let fullNetlist = netlist;
  // Ensure .END and .PRINT
  if (!fullNetlist.trim().toUpperCase().endsWith('.END')) {
    fullNetlist += '\n.END';
  }
  if (!/\.print/i.test(fullNetlist) && !/\.plot/i.test(fullNetlist) && !/\.fourier/i.test(fullNetlist)) {
    // Add a .print before .END
    fullNetlist = fullNetlist.replace(/\.END/i, '.PRINT DC V(1) V(2) I(V1)\n.END');
  }

  fs.writeFileSync(tmpNetlist, fullNetlist);

  try {
    const result = execSync(`ngspice -b -o "${tmpOut}" "${tmpNetlist}"`, {
      timeout: 15000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    // Read output from file
    let output = '';
    try { output = fs.readFileSync(tmpOut, 'utf8'); } catch {}
    return parseSpiceOutput(output || result);
  } catch (e) {
    // Try reading partial output
    let partial = '';
    try { partial = fs.readFileSync(tmpOut, 'utf8'); } catch {}
    return {
      error: e.message,
      stdout: partial.slice(0, 2000),
      stderr: (e.stderr || '').slice(0, 1000),
    };
  } finally {
    try { fs.unlinkSync(tmpNetlist); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

function parseSpiceOutput(output) {
  const lines = output.split('\n');
  const parsed = {
    summary: [],
    values: [],
    raw: output.slice(0, 5000),
  };

  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header noise
    if (trimmed.startsWith('Note:') || trimmed.startsWith('**') ||
        trimmed.startsWith('ngspice') || trimmed.startsWith('Circuit:')) {
      parsed.summary.push(trimmed);
      continue;
    }

    // Detect data lines with numbers
    if (/^[\d.eE+\-]+\s/.test(trimmed) || /^[\d.eE+\-]+\t/.test(trimmed)) {
      parsed.values.push(trimmed);
    } else if (trimmed.includes('voltage') || trimmed.includes('current') ||
               trimmed.includes('Index') || trimmed.includes('---')) {
      parsed.summary.push(trimmed);
      inTable = true;
    } else if (inTable && /^[\d.]+/.test(trimmed)) {
      parsed.values.push(trimmed);
    } else {
      parsed.summary.push(trimmed);
    }
  }

  return parsed;
}

// Generate a simple SPICE netlist from component data
export function generateNetlist(data) {
  const name = data.name || 'KEYCODE_CIRCUIT';
  let netlist = `${name}\n`;

  // Add components
  if (Array.isArray(data.components)) {
    for (const comp of data.components) {
      const ref = comp.reference || comp.ref || 'X1';
      const type = (comp.type || 'R').toUpperCase();
      const n1 = comp.net1 || comp.node1 || comp.n1 || 0;
      const n2 = comp.net2 || comp.node2 || comp.n2 || 0;
      const value = comp.value || '1k';

      if (type === 'V' || type === 'VDC') {
        netlist += `${ref} ${n1} ${n2} DC ${value}\n`;
      } else if (type === 'R') {
        netlist += `${ref} ${n1} ${n2} ${value}\n`;
      } else if (type === 'C') {
        netlist += `${ref} ${n1} ${n2} ${value}\n`;
      } else if (type === 'L') {
        netlist += `${ref} ${n1} ${n2} ${value}\n`;
      } else if (type === 'D') {
        netlist += `${ref} ${n1} ${n2} ${comp.model || '1N4148'}\n`;
      } else if (type === 'Q') {
        netlist += `${ref} ${comp.nc || n1} ${comp.nb || 0} ${comp.ne || n2} ${comp.model || '2N2222'}\n`;
      } else {
        netlist += `${ref} ${n1} ${n2} ${value}\n`;
      }
    }
  }

  // Add analysis command
  netlist += `.DC ${data.sourceName || 'V1'} ${data.start || 0} ${data.end || 5} ${data.step || 0.1}\n`;
  netlist += `.PRINT DC V(1) V(2) I(${data.sourceName || 'V1'})\n`;
  netlist += `.END`;

  return netlist;
}
