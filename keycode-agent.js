#!/usr/bin/env node
'use strict';
// ============================================================
//  KEYCODE AGENT CLI — keycode-agent.js
//  Usage:
//    node keycode-agent.js "build me a landing page for a coffee shop"
//    node keycode-agent.js --tools            list tools
//    node keycode-agent.js --memory           show memory
//    node keycode-agent.js --remember "fact"  save a fact
//    node keycode-agent.js --teach "name" "prompt"   teach a skill
//    node keycode-agent.js --sessions         recent runs
//  Env: KEYCODE_URL (default http://localhost:3000), KEYCODE_TOKEN (API/auth token)
//  With no token, runs locally (same engine as the server) instead of via API.
// ============================================================
const agent = require('./lib/agent-core');
const tools = require('./lib/agent-tools');

const args = process.argv.slice(2);

function die(msg) { console.error(msg); process.exit(1); }

async function main() {
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: node keycode-agent.js "goal" [--max-steps N]');
    console.log('       node keycode-agent.js --tools | --memory | --sessions');
    console.log('       node keycode-agent.js --remember "fact"');
    console.log('       node keycode-agent.js --teach "name" "prompt"');
    console.log('       node keycode-agent.js setup-llm <groq|openrouter|deepseek|openai|gemini> <API_KEY>');
    console.log('       node keycode-agent.js --github');
    return;
  }

  if (args[0] === '--tools') {
    for (const t of tools.manifest()) {
      console.log((t.danger ? '⚠ ' : '  ') + t.name.padEnd(16) + ' [' + t.group + '] ' + t.desc);
    }
    return;
  }
  if (args[0] === '--memory') {
    const m = agent.loadMemory();
    console.log('FACTS:');
    m.facts.slice(0, 20).forEach((f) => console.log('  - ' + f.text));
    console.log('SKILLS:');
    m.skills.slice(0, 20).forEach((s) => console.log('  - ' + s.name + ': ' + (s.notes || s.prompt.slice(0, 80))));
    return;
  }
  if (args[0] === '--remember') {
    const ok = agent.rememberFact(args.slice(1).join(' '));
    console.log(ok ? 'Saved.' : 'Duplicate; not saved.');
    return;
  }
  if (args[0] === '--teach') {
    const [name, prompt] = [args[1], args.slice(2).join(' ')];
    if (!name || !prompt) die('usage: --teach "name" "prompt"');
    const skill = agent.learnSkill(name, prompt);
    console.log('Learned skill ' + skill.id + ' (' + name + ')');
    return;
  }
  if (args[0] === '--sessions') {
    const s = agent.listSessions();
    if (!s.length) return console.log('No sessions yet.');
    s.slice(0, 20).forEach((x) => console.log(x.id + '  ' + x.status.padEnd(8) + ' ' + x.steps + ' steps  ' + x.goal.slice(0, 70)));
    return;
  }
  if (args[0] === '--github') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.log('✖ GITHUB_TOKEN not set.');
      console.log('  1. Create a token (repo scope): https://github.com/settings/tokens/new');
      console.log('  2. Add to .env:  GITHUB_TOKEN=ghp_your_token');
      return;
    }
    const r = await tools.get('github_call').run({ path: '/user' }, {});
    if (r.ok) console.log('✔ GitHub connected as ' + (r.data.login || '?') + ' — agent can create issues/PRs.');
    else console.log('✖ GitHub token check failed: HTTP ' + r.status);
    return;
  }
  if (args[0] === 'setup-llm') {
    // Usage: node keycode-agent.js setup-llm openai-compatible gsk_... https://api.groq.com/openai/v1 llama-3.3-70b-versatile
    const [provider, key, baseUrl, model] = args.slice(1);
    const PRESETS = {
      groq: ['openai-compatible', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
      openrouter: ['openai-compatible', 'https://openrouter.ai/api/v1', 'openrouter/auto'],
      deepseek: ['openai-compatible', 'https://api.deepseek.com/v1', 'deepseek-chat'],
      openai: ['openai', '', 'gpt-4o-mini'],
      gemini: ['gemini', '', 'gemini-2.0-flash'],
    };
    let p = provider, k = key, b = baseUrl, m = model;
    if (PRESETS[provider] && !key) { console.log('Usage: node keycode-agent.js setup-llm <groq|openrouter|deepseek|openai|gemini> <API_KEY>'); process.exit(1); }
    if (PRESETS[provider] && !baseUrl) { [p, b, m] = [PRESETS[provider][0], PRESETS[provider][1], PRESETS[provider][2] ]; m = model || PRESETS[provider][2]; k = key; }
    if (!p || !k) { console.log('Usage: node keycode-agent.js setup-llm <groq|openrouter|deepseek|openai|gemini> <API_KEY> [baseUrl] [model]'); process.exit(1); }
    // live-validate before saving
    process.env.AI_PROVIDER = p; process.env.AI_API_KEY = k; process.env.AI_BASE_URL = b || ''; process.env.AI_MODEL = m || '';
    const ai = require('./lib/ai-provider');
    console.log('Testing ' + p + (b ? ' (' + b + ')' : '') + ' with model ' + (m || '(default)') + '…');
    const test = await ai.llmComplete('Reply with the single word: READY', { maxTokens: 20, timeoutMs: 30000 });
    if (!test) { console.log('✖ Key failed validation. Not saved.'); process.exit(1); }
    console.log('✔ Key works (' + test.model + ' replied: ' + test.text.trim().slice(0, 40) + ')');
    // persist to .env
    const fs2 = require('fs');
    const envPath = require('path').join(process.cwd(), '.env');
    let env = fs2.existsSync(envPath) ? fs2.readFileSync(envPath, 'utf8') : '';
    const lines = env.split('\n').filter((l) => !/^AI_(PROVIDER|API_KEY|MODEL|BASE_URL)=/.test(l));
    lines.push('AI_PROVIDER=' + p, 'AI_API_KEY=' + k, 'AI_MODEL=' + (m || ''), 'AI_BASE_URL=' + (b || ''));
    fs2.writeFileSync(envPath, lines.filter((l, i, arr) => l !== '' || i < arr.length - 1).join('\n') + '\n');
    console.log('✔ Saved to .env — the agent now uses ' + p + '/' + (m || 'default model') + '.');
    return;
  }

  // run a goal
  const maxStepsFlag = args.indexOf('--max-steps');
  const maxSteps = maxStepsFlag !== -1 ? parseInt(args[maxStepsFlag + 1], 10) : undefined;
  const goal = args.filter((a, i) => a !== '--max-steps' && i !== maxStepsFlag + 1).join(' ').trim();
  if (!goal) die('No goal given.');

  console.log('▶ KEYCODE Agent — goal: ' + goal);
  const session = await agent.runTask({ goal: goal, maxSteps: maxSteps }, function (evt) {
    if (evt.type === 'step') {
      const s = evt.step;
      console.log('\n[' + s.n + '] thought: ' + (s.thought || '(none)'));
      if (s.tool) console.log('    → tool ' + s.tool + '(' + JSON.stringify(s.args).slice(0, 120) + ')');
      if (s.result) console.log('    ← ' + JSON.stringify(s.result).slice(0, 300));
    } else if (evt.type === 'final') {
      console.log('\n✔ FINAL: ' + evt.text);
    }
  });
  console.log('\nSession: ' + session.id + '  status: ' + session.status);
  process.exit(session.status === 'done' ? 0 : 1);
}

main().catch((e) => die(String((e && e.stack) || e)));
