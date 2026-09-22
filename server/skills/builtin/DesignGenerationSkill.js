/**
 * DesignGenerationSkill - Award-level visual design expertise
 * Encodes the design-system knowledge the AI Builder applies when forging
 * websites: tokens, typography, motion, accessibility, art direction.
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class DesignGenerationSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'design-generation',
      name: 'Design Generation',
      description: 'Award-level design-system expertise: color tokens, fluid typography, motion choreography, and accessibility baked into generated projects',
      version: '1.0.0',
      category: SkillCategory.DESIGN,
      author: 'KEYCODE',
      keywords: ['design', 'css', 'tokens', 'typography', 'motion', 'accessibility', 'ui', 'ux', 'theme'],
      permissions: [],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          defaultTheme: { type: 'string', enum: ['dark', 'light', 'auto'], default: 'dark' },
          enforceReducedMotion: { type: 'boolean', default: true },
          contrastTarget: { type: 'string', enum: ['AA', 'AAA'], default: 'AA' }
        }
      },
      defaultConfig: { defaultTheme: 'dark', enforceReducedMotion: true, contrastTarget: 'AA' },
      examples: [
        { prompt: 'Design tokens for a fintech dashboard', description: 'Generates a full CSS custom-property system' },
        { prompt: 'Review the visual hierarchy of this landing page', description: 'Critique mode' }
      ]
    });
    super(definition);
  }

  /**
   * Expertise injected into the agent's system prompt when this skill is
   * enabled for a build. Kept dense — every line must change the output.
   */
  static expertisePrompt() {
    return [
      'DESIGN SYSTEM DISCIPLINE (non-negotiable):',
      '- Tokens first: every color/spacing/radius/shadow is a CSS custom property under :root; zero magic values in component rules.',
      '- Fluid type with clamp(): --text-xs..--text-4xl scale; display font (Space Grotesk / Sora / Clash Display) paired with Inter body.',
      '- Palette: one bold hue + one accent + true neutrals; avoid default blue/purple clichés; WCAG AA contrast minimum.',
      '- Spacing on a 4px grid; consistent radius scale (--radius-sm..xl) and one elevation system.',
      '- Motion: transform/opacity only, 60fps, IntersectionObserver reveals, staggered entrances, prefers-reduced-motion support.',
      '- Depth via layering (glassmorphism, gradient borders, film grain) — not heavy drop shadows.',
      '- Micro-interactions on every clickable element: hover lift, focus-visible rings, active press, ripple where fitting.'
    ].join('\n');
  }

  validateInput(input) {
    if (!input.prompt && !input.params?.code) {
      return { valid: false, errors: ['prompt or code is required'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const mode = input.params?.mode || 'tokens';
    execution.emit('progress', { stage: 'designing', progress: 0.5, message: 'Composing design system' });

    if (mode === 'critique') {
      const code = input.params?.code || input.prompt;
      const checks = [
        { id: 'tokens', ok: /:root\s*{[^}]*--/.test(code), note: 'CSS custom properties defined in :root' },
        { id: 'responsive', ok: /@media[^{]*\(\s*max-width\s*:\s*\d+px\s*\)/.test(code), note: 'responsive breakpoints present' },
        { id: 'reduced-motion', ok: /prefers-reduced-motion/.test(code), note: 'prefers-reduced-motion respected' },
        { id: 'focus', ok: /focus-visible|:focus/.test(code), note: 'focus states styled' },
        { id: 'fluid-type', ok: /clamp\(/.test(code), note: 'fluid clamp() typography' },
        { id: 'aria', ok: /aria-/.test(code), note: 'ARIA attributes present' }
      ];
      const passed = checks.filter(c => c.ok).length;
      return BaseSkill.createSuccess(
        { checks, score: Math.round((passed / checks.length) * 10) / 10 },
        `Design audit: ${passed}/${checks.length} checks passed`,
        { mode: 'critique' }
      );
    }

    const theme = input.params?.theme || this.config.defaultTheme;
    const tokens = this._tokenSet(theme);
    return BaseSkill.createSuccess(
      { tokens, css: this._tokensToCss(tokens) },
      'Design token system generated',
      { mode: 'tokens', theme }
    );
  }

  _tokenSet(theme) {
    const dark = theme !== 'light';
    return {
      '--bg': dark ? '#0b0c10' : '#fafafc',
      '--bg-card': dark ? '#12141d' : '#ffffff',
      '--text': dark ? '#e8eaf1' : '#14161f',
      '--text-muted': dark ? '#9aa1b5' : '#5a6072',
      '--primary': '#6d7cff',
      '--accent': '#f5b942',
      '--radius-sm': '8px', '--radius-md': '14px', '--radius-lg': '22px',
      '--font-display': "'Space Grotesk', sans-serif",
      '--font-sans': "'Inter', sans-serif",
      '--transition': '180ms cubic-bezier(.4,0,.2,1)'
    };
  }

  _tokensToCss(tokens) {
    return ':root {\n' + Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}';
  }
}

export default DesignGenerationSkill;
