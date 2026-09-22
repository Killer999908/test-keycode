/**
 * FullStackScaffoldSkill - Full-stack engineering expertise
 * The "fully blown-up level" upgrade: pushes the agent past landing pages into
 * real applications — layered backend, data layer, tests, and API contracts.
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class FullStackScaffoldSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'fullstack-scaffold',
      name: 'Full-Stack Scaffold',
      description: 'Full-stack engineering discipline: layered backend architecture, data modeling, API contracts, auth flows, test scaffolds, and error handling',
      version: '1.0.0',
      category: SkillCategory.CODE,
      author: 'KEYCODE',
      keywords: ['fullstack', 'backend', 'api', 'database', 'auth', 'crud', 'tests', 'architecture', 'express', 'rest'],
      permissions: [],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          backend: { type: 'string', enum: ['express', 'fastify', 'none'], default: 'express' },
          database: { type: 'string', enum: ['sqlite', 'memory', 'mongo', 'none'], default: 'memory' },
          includeTests: { type: 'boolean', default: true },
          includeAuth: { type: 'boolean', default: false }
        }
      },
      defaultConfig: { backend: 'express', database: 'memory', includeTests: true, includeAuth: false },
      examples: [
        { prompt: 'Build a task manager with users and persistence', description: 'Full CRUD app with tests' },
        { prompt: 'Scaffold a SaaS starter with JWT auth', description: 'Auth-enabled scaffold' }
      ]
    });
    super(definition);
  }

  validateInput(input) {
    if (!input.prompt) return { valid: false, errors: ['prompt is required'] };
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const { prompt } = input;
    const opts = {
      backend: input.params?.backend || this.config.backend,
      database: input.params?.database || this.config.database,
      includeTests: input.params?.includeTests ?? this.config.includeTests,
      includeAuth: input.params?.includeAuth ?? this.config.includeAuth
    };

    execution.emit('progress', { stage: 'scaffolding', progress: 0.4, message: 'Planning full-stack structure' });

    // Entity extraction heuristic: pull likely nouns from the request so the
    // scaffold names routes/models after what the user actually asked for.
    const stop = new Set(['build', 'create', 'make', 'with', 'and', 'for', 'the', 'a', 'an', 'app', 'website', 'site', 'page', 'system', 'manager', 'using', 'that', 'has', 'have', 'add']);
    const words = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const entities = [...new Set(words.filter(w => w.length > 3 && !stop.has(w)))].slice(0, 3);
    const primary = entities[0] || 'item';

    const routes = ['GET /api/' + primary + 's', 'GET /api/' + primary + 's/:id', 'POST /api/' + primary + 's', 'PUT /api/' + primary + 's/:id', 'DELETE /api/' + primary + 's/:id'];

    const structure = {
      entities,
      primaryEntity: primary,
      routes,
      layers: ['routes', 'controllers', 'services', 'repositories', 'middleware'],
      files: ['server.js', 'routes.js', 'db.js', 'app.test.js', 'package.json', '.env.example'],
      testPlan: [
        'happy path for every route',
        'validation rejects malformed payloads (400)',
        'missing resource returns 404',
        'health endpoint returns 200'
      ]
    };

    const summary = `Full-stack plan: ${primary} CRUD with ${opts.backend} + ${opts.database} storage, ${opts.includeTests ? 'tests, ' : ''}${layers(opts.includeAuth)}`;
    return BaseSkill.createSuccess(structure, summary, { backend: opts.backend, database: opts.database });
  }

  /**
   * Expertise hint injected into the build system prompt when enabled.
   * This is the core of the "full-blown full-stack" upgrade.
   */
  static expertisePrompt() {
    return [
      'FULL-STACK ENGINEERING DISCIPLINE (non-negotiable):',
      '- Build a REAL application, not a landing page: working CRUD, client-side state, and fetch() calls to the actual API.',
      '- Layer the backend: routes → controllers → services. One concern per file. No god-files.',
      '- Data layer: define schemas with validation (zod/express-validator); persist to SQLite (better-sqlite3) or an in-memory store with seed data — never fake static arrays in the frontend.',
      '- Every route: input validation → 400 with field errors; missing → 404; errors → centralized error middleware; correct status codes throughout.',
      '- Write app.test.js with 5+ real tests (node:test or Jest): happy paths, validation failures, 404s, and /api/health.',
      '- package.json: exact deps, engines field, test/start scripts, NODE_ENV awareness.',
      '- Frontend talks to the backend: fetch with error handling, optimistic UI, loading states, toasts for failures.',
      '- Ship .env.example and document every env var in the README.'
    ].join('\n');
  }
}

function layers(includeAuth) {
  return includeAuth ? 'auth layer' : 'layered architecture';
}

export default FullStackScaffoldSkill;
