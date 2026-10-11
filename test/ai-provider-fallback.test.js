'use strict';

const { spawnSync } = require('child_process');

describe('AI provider fallback chain', () => {
  test('uses keyless Pollinations after configured providers are unavailable', () => {
    const script = [
      "process.env.AI_PROVIDER = 'openai';",
      "process.env.AI_API_KEY = 'test-primary-key';",
      "process.env.AI_MODEL = 'gpt-4o-mini';",
      "process.env.AI_FALLBACK = 'openai-compatible|test-router-key|https://openrouter.test/api/v1|test-model;gemini|test-gemini-key||test-model';",
      'const originalSetTimeout = global.setTimeout;',
      'global.setTimeout = function (callback) { return originalSetTimeout(callback, 0); };',
      'global.fetch = async function (url) {',
      "  if (String(url).startsWith('https://text.pollinations.ai/')) return { ok: true, text: async function () { return 'READY'; } };",
      "  return { ok: false, status: 429, text: async function () { return 'quota unavailable'; } };",
      '};',
      "require(" + JSON.stringify(require.resolve('../lib/ai-provider')) + ").llmComplete('Reply READY.', { timeoutMs: 100 }).then(function (result) {",
      "  console.log(JSON.stringify(result && { provider: result.provider, model: result.model, text: result.text }));",
      '}).catch(function (error) { console.error(error.message); process.exitCode = 1; });',
    ].join('\n');
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim().split('\n').pop())).toEqual({ provider: 'pollinations', model: 'openai', text: 'READY' });
  });
});
