/**
 * SecurityAuditSkill - Security expertise & automated audit
 * Injects secure-coding discipline into every build and provides a static
 * audit pass that flags the vulnerability classes free models most often emit.
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class SecurityAuditSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'security-audit',
      name: 'Security Audit',
      description: 'OWASP-grade secure coding discipline plus a static audit that flags XSS, injection, secrets-in-code, and missing validation in generated projects',
      version: '1.0.0',
      category: SkillCategory.SECURITY,
      author: 'KEYCODE',
      keywords: ['security', 'owasp', 'xss', 'csrf', 'injection', 'audit', 'sanitize', 'validation'],
      permissions: [SkillPermission.FILESYSTEM],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          strictness: { type: 'string', enum: ['relaxed', 'standard', 'strict'], default: 'standard' },
          autoFixTrivial: { type: 'boolean', default: true }
        }
      },
      defaultConfig: { strictness: 'standard', autoFixTrivial: true },
      examples: [
        { prompt: 'Audit this generated site for XSS', description: 'Static audit pass' },
        { prompt: 'Harden the backend of my project', description: 'Hardening expertise' }
      ]
    });
    super(definition);
  }

  validateInput(input) {
    if (!input.prompt && !input.params?.files) {
      return { valid: false, errors: ['prompt or files map is required'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const files = input.params?.files || {};
    const findings = [];
    let scanned = 0;

    execution.emit('progress', { stage: 'auditing', progress: 0.3, message: 'Scanning generated files' });

    for (const [name, content] of Object.entries(files)) {
      if (typeof content !== 'string' || content.length < 20) continue;
      scanned++;
      const isHtml = /\.html?$/.test(name);
      const isJs = /\.jsx?$/.test(name);
      const isServer = isJs && /(express|app\.(get|post|put|delete)|req\.)/.test(content);

      if (isHtml && /\.innerHTML\s*=/.test(content) && !/DOMPurify|sanitize/.test(content)) {
        findings.push({ file: name, severity: 'high', rule: 'xss-innerhtml', note: 'innerHTML assignment without sanitization' });
      }
      if (isHtml && /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(content)) {
        findings.push({ file: name, severity: 'critical', rule: 'hardcoded-secret', note: 'possible hardcoded credential' });
      }
      if (isServer && /(eval|new Function)\s*\(/.test(content)) {
        findings.push({ file: name, severity: 'high', rule: 'eval-use', note: 'eval/new Function on server code' });
      }
      if (isServer && /(query|exec)\s*\(\s*[`'"].*\+\s*(req\.|params|body)/i.test(content)) {
        findings.push({ file: name, severity: 'critical', rule: 'sql-injection', note: 'string-concatenated query with request data' });
      }
      if (isServer && !/(helmet|rate.?limit)/i.test(content) && /express\(\)/.test(content)) {
        findings.push({ file: name, severity: 'medium', rule: 'missing-hardening', note: 'Express app without helmet/rate-limit' });
      }
      if (/http:\/\/(?!localhost|127\.)/.test(content)) {
        findings.push({ file: name, severity: 'low', rule: 'insecure-url', note: 'plain http:// resource reference' });
      }
    }

    const score = Math.max(0, 10 - findings.filter(f => f.severity === 'critical').length * 3 - findings.filter(f => f.severity === 'high').length * 1.5);
    const summary = scanned === 0
      ? 'Security audit: nothing to scan'
      : `Security audit: ${findings.length} finding(s) across ${scanned} file(s) — score ${Math.round(score * 10) / 10}/10`;

    return BaseSkill.createSuccess({ findings, scanned, score: Math.round(score * 10) / 10 }, summary, { ruleVersion: '1.0.0' });
  }

  /**
   * Expertise hint injected into the build system prompt when enabled.
   */
  static expertisePrompt() {
    return [
      'SECURE CODING DISCIPLINE (non-negotiable):',
      '- Never hardcode secrets, API keys, or tokens — read from environment variables and ship a .env.example.',
      '- Escape every dynamic string before innerHTML; prefer textContent or DOMPurify.',
      '- Server routes: validate + sanitize all input (zod or manual checks), parameterize queries, never string-concat SQL.',
      '- Express apps include helmet, CORS restricted to known origins, and express-rate-limit.',
      '- Set security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP where feasible.',
      '- Passwords: bcrypt (cost >= 10). Sessions: httpOnly, secure, sameSite cookies.'
    ].join('\n');
  }
}

export default SecurityAuditSkill;
