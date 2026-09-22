/**
 * InfrastructureSkill - Deployment & infrastructure expertise
 * Generated projects ship with real deploy configs instead of dead ends:
 * Dockerfiles, CI workflows, and platform-specific runtime detection.
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class InfrastructureSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'infrastructure',
      name: 'Infrastructure & Deploy',
      description: 'Deployment expertise: detects project shape and emits Docker, GitHub Actions CI, and platform configs (Render/Railway/Vercel) for generated projects',
      version: '1.0.0',
      category: SkillCategory.INFRASTRUCTURE,
      author: 'KEYCODE',
      keywords: ['deploy', 'docker', 'ci', 'cd', 'github-actions', 'railway', 'render', 'vercel', 'nginx', 'hosting'],
      permissions: [SkillPermission.FILESYSTEM],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          targetPlatform: { type: 'string', enum: ['docker', 'render', 'railway', 'vercel', 'static'], default: 'docker' },
          nodeVersion: { type: 'string', default: '20' },
          emitCI: { type: 'boolean', default: true }
        }
      },
      defaultConfig: { targetPlatform: 'docker', nodeVersion: '20', emitCI: true },
      examples: [
        { prompt: 'Make this project deployable on Railway', description: 'Emits railway.json + Dockerfile' },
        { prompt: 'Add CI to this repo', description: 'Emits GitHub Actions workflow' }
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
    const hasBackend = !!(files['server.js'] || files['package.json']) || input.params?.hasBackend === true;
    const platform = input.params?.platform || this.config.targetPlatform;

    execution.emit('progress', { stage: 'infra', progress: 0.4, message: `Generating ${platform} deploy config` });

    const emitted = {};

    if (platform === 'docker' || hasBackend) {
      emitted['Dockerfile'] = this._dockerfile(hasBackend, files);
      emitted['.dockerignore'] = ['node_modules', '.git', 'dist', '.env', '*.log', 'exports', 'preview'].join('\n');
    }
    if (this.config.emitCI) {
      emitted['.github/workflows/ci.yml'] = this._ciWorkflow(hasBackend);
    }
    if (platform === 'render') {
      emitted['render.yaml'] = this._renderYaml(hasBackend);
    } else if (platform === 'railway') {
      emitted['railway.json'] = JSON.stringify({
        $schema: 'https://railway.app/railway.schema.json',
        build: { builder: 'DOCKERFILE', dockerfilePath: './Dockerfile' },
        deploy: { startCommand: hasBackend ? 'node server.js' : 'npx serve .', restartPolicyType: 'ON_FAILURE' }
      }, null, 2);
    } else if (platform === 'static') {
      emitted['_headers'] = ['/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin'].join('\n');
    }

    const summary = `Infrastructure: ${Object.keys(emitted).join(', ')} (${platform}${hasBackend ? ' + backend' : ' · static'})`;
    return BaseSkill.createSuccess({ files: emitted, platform, hasBackend }, summary, { emittedCount: Object.keys(emitted).length });
  }

  _dockerfile(hasBackend, files) {
    const startCmd = hasBackend ? 'node server.js' : (files['package.json'] ? 'npx serve .' : 'python3 -m http.server 8080');
    return `FROM node:${this.config.nodeVersion}-alpine
WORKDIR /app
${hasBackend ? "COPY package*.json ./\nRUN npm ci --omit=dev || npm install --omit=dev\nCOPY . .\n" : 'COPY . .\n'}
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "${startCmd}"]`;
  }

  _ciWorkflow(hasBackend) {
    return `name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${this.config.nodeVersion}', cache: ${hasBackend ? 'npm' : "''"} }
${hasBackend ? '      - run: npm ci\n      - run: npm test --if-present\n' : '      - run: echo "static site — no build"\n'}
      - name: Smoke check
        run: test -f index.html && echo "index.html present"`;
  }

  _renderYaml(hasBackend) {
    return hasBackend
      ? `services:
  - type: web
    name: app
    runtime: node
    plan: free
    buildCommand: npm ci
    startCommand: node server.js
    healthCheckPath: /api/health`
      : `services:
  - type: web
    name: app
    runtime: static
    buildCommand: echo static
    staticPublishPath: .`;
  }

  /**
   * Expertise hint injected into the build system prompt when the skill is
   * enabled — pushes the generator to ship deploy-ready projects.
   */
  static expertisePrompt() {
    return [
      'DEPLOYMENT DISCIPLINE:',
      '- Ship a Dockerfile + .dockerignore with every backend project; pin the base image version.',
      '- Respect the PORT environment variable and expose /api/health for platform health checks.',
      '- Never commit secrets: read from env, provide .env.example, add .env to .dockerignore.',
      '- Add a GitHub Actions CI workflow that installs, tests (if tests exist), and smoke-checks the build.'
    ].join('\n');
  }
}

export default InfrastructureSkill;
