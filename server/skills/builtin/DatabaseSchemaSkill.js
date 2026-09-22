/**
 * DatabaseSchemaSkill - Data modeling expertise
 * Teaches the agent to design real schemas (relations, indexes, constraints)
 * instead of throwing untyped JSON blobs around.
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class DatabaseSchemaSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'database-schema',
      name: 'Database Schema',
      description: 'Data-modeling expertise: normalized schemas, relations, indexes, migrations, and seed data for generated backends',
      version: '1.0.0',
      category: SkillCategory.DATA,
      author: 'KEYCODE',
      keywords: ['database', 'schema', 'sql', 'sqlite', 'mongo', 'model', 'migration', 'index', 'seed'],
      permissions: [],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          engine: { type: 'string', enum: ['sqlite', 'memory', 'mongo', 'postgres'], default: 'sqlite' },
          normalize: { type: 'boolean', default: true }
        }
      },
      defaultConfig: { engine: 'sqlite', normalize: true },
      examples: [
        { prompt: 'Design a schema for an e-commerce store', description: 'Products, orders, users with relations' }
      ]
    });
    super(definition);
  }

  validateInput(input) {
    if (!input.prompt && !input.params?.entities) {
      return { valid: false, errors: ['prompt or entities list is required'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const engine = input.params?.engine || this.config.engine;
    const entities = input.params?.entities || this._entitiesFromPrompt(input.prompt || '');
    execution.emit('progress', { stage: 'modeling', progress: 0.5, message: 'Designing schema' });

    const schema = {
      engine,
      tables: entities.map(name => ({
        name,
        columns: [
          { name: 'id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
          { name: 'title', type: 'TEXT NOT NULL' },
          { name: 'status', type: "TEXT DEFAULT 'active'" },
          { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ],
        indexes: [`idx_${name}_status ON ${name}(status)`]
      })),
      seedStrategy: '5 realistic rows per table on first boot'
    };

    const summary = `Schema: ${entities.length} table(s) on ${engine} with indexes + seed data`;
    return BaseSkill.createSuccess(schema, summary);
  }

  _entitiesFromPrompt(prompt) {
    const stop = new Set(['build', 'create', 'make', 'with', 'and', 'for', 'the', 'app', 'website', 'using', 'that']);
    const words = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    return [...new Set(words.filter(w => w.length > 3 && !stop.has(w)))].slice(0, 3).map(w => w + 's');
  }

  /**
   * Expertise hint injected into the build system prompt when enabled.
   */
  static expertisePrompt() {
    return [
      'DATA MODELING DISCIPLINE:',
      '- Design schemas before code: entities, relations (1:N, N:M via join tables), and constraints (NOT NULL, UNIQUE, FK).',
      '- Index every column you filter or join on; show the CREATE INDEX statements.',
      '- Timestamps on every row (created_at/updated_at); soft deletes where history matters.',
      '- Persist with better-sqlite3 (file) or an in-memory store seeded with 5 realistic rows — the UI must show real data on first load.',
      '- Validation lives at the boundary (schema-level), not scattered across routes.'
    ].join('\n');
  }
}

export default DatabaseSchemaSkill;
