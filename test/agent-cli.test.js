'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const cliPath = path.join(repoRoot, 'keycode-agent.js');

function runAgent(tempDir, goal, options) {
  const args = [];
  if (options && options.preloadPath) args.push('--require', options.preloadPath);
  args.push(cliPath, goal, '--max-steps', '5');
  return spawnSync(process.execPath, args, {
    cwd: tempDir,
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, process.env, {
      AI_PROVIDER: options && options.preloadPath ? 'openai' : 'disabled',
      OPENAI_API_KEY: options && options.preloadPath ? 'test-key' : '',
      NODE_ENV: 'test',
    }),
  });
}

describe('KEYCODE standalone agent CLI', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-agent-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses local build fallback and verifies the website artifact', () => {
    const result = runAgent(tempDir, 'Create a landing page for a neighborhood bakery');
    const owner = require('crypto').createHash('sha256').update('local').digest('hex');
    const artifact = path.join(tempDir, 'data', 'agent-workspaces', owner, 'default', 'site.html');
    const sessions = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'agent-sessions.json'), 'utf8'));

    expect(result.status).toBe(0);
    expect(sessions[0].status).toBe('done');
    expect(sessions[0].steps.map(step => step.tool)).toEqual(['build_website', 'fs_read', null]);
    expect(sessions[0].final).toContain('verified site.html');
    expect(fs.readFileSync(artifact, 'utf8')).toContain('neighborhood bakery');
  });

  test('does not report unsupported tasks as successful without live AI', () => {
    const result = runAgent(tempDir, 'Research the history of the printing press');
    const sessions = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'agent-sessions.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(sessions[0].status).toBe('failed');
    expect(sessions[0].final).toContain('live AI reasoning is unavailable');
  });

  test('ignores an unusable model plan after completion calls fail', () => {
    const preloadPath = path.join(tempDir, 'mock-provider.js');
    fs.writeFileSync(preloadPath, [
      "const ai = require(" + JSON.stringify(path.join(repoRoot, 'lib', 'ai-provider')) + ");",
      "ai.llmInfo = function () { return { configured: true, provider: 'test', model: 'test-model' }; };",
      'let calls = 0;',
      'ai.llmComplete = async function () {',
      '  calls++;',
      "  if (calls === 1) return { text: JSON.stringify({ plan: ['ask an LLM to draft the page', 'write a notes file'], tool_hints: { 'ask an LLM to draft the page': 'llm', 'write a notes file': 'fs_write' } }) };",
      '  return null;',
      '};',
    ].join('\n'));
    const result = runAgent(tempDir, 'Build a website for a neighborhood bakery', { preloadPath });
    const owner = require('crypto').createHash('sha256').update('local').digest('hex');
    const artifact = path.join(tempDir, 'data', 'agent-workspaces', owner, 'default', 'site.html');
    const sessions = JSON.parse(fs.readFileSync(path.join(tempDir, 'data', 'agent-sessions.json'), 'utf8'));

    expect(result.status).toBe(0);
    expect(sessions[0].status).toBe('done');
    expect(sessions[0].steps.map(step => step.tool)).toEqual(['build_website', 'fs_read', null]);
    expect(fs.existsSync(artifact)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'data', 'agent-workspaces', owner, 'default', 'plan_output.txt'))).toBe(false);
  });
});
