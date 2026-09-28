// ============================================================
// kc CLI — Permission Layer
// ============================================================
// The agent asks before it does anything risky. In --yolo mode
// everything is auto-approved and logged. Decisions apply per-tool
// for the whole run (approve "bash" once → all future bash calls in
// this run run without re-prompting).

import { createInterface } from 'readline/promises';
import { Writable } from 'stream';

// Tools that can damage things outside the run sandbox
const RISKY_TOOLS = new Set([
  'code_run', 'spawn_agent', 'workspace_zip', 'file_edit',
  'repo_read', 'repo_search', 'repo_tree', 'repo_symbols', 'repo_summarize',
]);

/**
 * Ask the human. Resolves 'yes' | 'no'. Works even when stdin is a
 * pipe by falling back to /dev/tty; if no TTY at all, resolves 'no'
 * (fail-closed — never silently auto-approve).
 */
async function ask(question) {
  if (!process.stdout.isTTY || !process.stderr.isTTY) {
    // no interactive terminal — fail closed
    return 'no';
  }
  const rl = createInterface({
    input: process.stdin,
    output: new Writable({
      write(chunk, _enc, cb) { process.stderr.write(chunk); cb(); },
    }),
    prompt: '',
  });
  try {
    const answer = await rl.question(question);
    const a = answer.trim().toLowerCase();
    if (a === 'y' || a === 'yes' || a === 'a' || a === 'always') return a === 'a' || a === 'always' ? 'yes' : 'yes';
    return 'no';
  } finally {
    rl.close();
  }
}

export class PermissionGate {
  /**
   * @param {object} opts
   * @param {boolean} opts.yolo        auto-approve everything
   * @param {string[]} opts.allow      pre-approved tool names
   * @param {boolean} opts.verbose     log even auto-approved calls
   */
  constructor({ yolo = false, allow = [], verbose = false } = {}) {
    this.yolo = !!yolo;
    this.allow = new Set(allow);
    this.verbose = !!verbose;
    this.denied = 0;
    this.approved = 0;
  }

  /**
   * Returns true if the call may proceed. Prompt is only shown once per
   * tool per run; the decision sticks.
   */
  async check(toolName, args, opts = {}) {
    const summary = typeof opts.summary === 'string' ? opts.summary : JSON.stringify(args || {}).slice(0, 100);
    const risky = RISKY_TOOLS.has(toolName) || !!opts.risky;

    if (this.yolo) {
      if (this.verbose) process.stderr.write(`  [auto] ${toolName} ${summary}\n`);
      this.approved++;
      return true;
    }
    if (!risky) {
      this.approved++;
      return true;
    }
    if (this.allow.has(toolName)) {
      if (this.verbose) process.stderr.write(`  [ok] ${toolName}\n`);
      this.approved++;
      return true;
    }

    process.stderr.write(`\n\x1b[2m┌─ agent wants to run:\x1b[0m\n`);
    process.stderr.write(`\x1b[1m│ ${toolName}\x1b[0m ${summary}\n`);
    process.stderr.write(`\x1b[2m└─\x1b[0m Allow? \x1b[36m[y/N]\x1b[0m `);
    const answer = await ask('');
    if (answer === 'yes') {
      this.allow.add(toolName);   // stick for the rest of the run
      this.approved++;
      process.stderr.write(`\x1b[2m  → allowed for the rest of this run\x1b[0m\n`);
      return true;
    }
    this.denied++;
    process.stderr.write(`\x1b[2m  → denied\x1b[0m\n`);
    return false;
  }

  stats() {
    return { yolo: this.yolo, approved: this.approved, denied: this.denied };
  }
}
