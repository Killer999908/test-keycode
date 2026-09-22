/**
 * SkillRegistry - Central registry for managing skills
 * Handles loading, unloading, discovery, and execution of skills
 */

import { BaseSkill } from './BaseSkill.js';
import { SkillDefinition, SkillManifest, SkillContext, SkillInput, SkillOutput, SkillExecution, SkillCategory, SkillPermission, SkillRuntime } from './types.js';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SkillRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.skills = new Map(); // id -> SkillManifest
    this.categories = new Map(); // category -> Set<id>
    this.permissions = new Map(); // permission -> Set<id>
    // __dirname is already the skills directory. External skills live in the
    // sibling "external" folder so they can be dropped in without touching
    // the built-in framework files.
    this.skillsPath = options.skillsPath || path.join(__dirname, 'external');
    this.autoLoad = options.autoLoad !== false;
    this.allowExternal = options.allowExternal !== false;
    this.externalRegistries = options.externalRegistries || [];
    this.logger = options.logger || console;
    this.context = options.context || {};
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    
    // Ensure skills directory exists
    if (!fs.existsSync(this.skillsPath)) {
      fs.mkdirSync(this.skillsPath, { recursive: true });
    }

    // Load built-in skills
    await this._loadBuiltinSkills();
    
    // Auto-load skills from directory
    if (this.autoLoad) {
      await this.loadAllFromDirectory(this.skillsPath);
    }

    this._initialized = true;
    this.emit('ready');
    this.logger.info('[SkillRegistry] Initialized with', this.skills.size, 'skills');
  }

  async _loadBuiltinSkills() {
    // Discover the builtin directory instead of hardcoding filenames, so a new
    // skill file is picked up without also having to remember to edit this
    // list. BaseSkill.js is the shared base class, not a skill.
    const builtinDir = path.join(__dirname, 'builtin');
    let entries = [];
    try {
      entries = fs.readdirSync(builtinDir, { withFileTypes: true });
    } catch (error) {
      this.logger.warn('[SkillRegistry] No builtin skills directory found:', error.message);
      return;
    }

    const builtinSkills = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'BaseSkill.js')
      .map((entry) => `./builtin/${entry.name}`)
      .sort();

    for (const skillPath of builtinSkills) {
      try {
        const fullPath = path.join(__dirname, skillPath);
        if (fs.existsSync(fullPath)) {
          const module = await import(fullPath);
          const SkillClass = module.default || module[Object.keys(module).find(k => k.endsWith('Skill'))];
          if (SkillClass && SkillClass.prototype instanceof BaseSkill) {
            const skill = new SkillClass();
            await this.register(skill);
          }
        }
      } catch (error) {
        this.logger.warn(`[SkillRegistry] Failed to load builtin skill ${skillPath}:`, error.message);
      }
    }
  }

  async register(skill, options = {}) {
    if (!(skill instanceof BaseSkill)) {
      throw new Error('Skill must be an instance of BaseSkill');
    }

    const validation = skill.definition.validate();
    if (!validation.valid) {
      throw new Error(`Invalid skill definition: ${validation.errors.join(', ')}`);
    }

    const id = skill.definition.id;
    
    // Check for conflicts
    if (this.skills.has(id) && !options.force) {
      throw new Error(`Skill ${id} already registered. Use force: true to overwrite.`);
    }

    // Initialize skill with context
    const skillContext = new SkillContext({
      ...this.context,
      skillRegistry: this
    });

    try {
      await skill.initialize(skill.definition.defaultConfig, skillContext);
    } catch (error) {
      this.logger.error(`[SkillRegistry] Failed to initialize skill ${id}:`, error.message);
      throw error;
    }

    // Create manifest
    const manifest = new SkillManifest(skill.definition, skill);
    
    // Store
    this.skills.set(id, manifest);
    
    // Index by category
    const cat = skill.definition.category;
    if (!this.categories.has(cat)) this.categories.set(cat, new Set());
    this.categories.get(cat).add(id);
    
    // Index by permissions
    for (const perm of skill.definition.permissions) {
      if (!this.permissions.has(perm)) this.permissions.set(perm, new Set());
      this.permissions.get(perm).add(id);
    }

    // Call onLoad
    await skill.onLoad(this);

    this.emit('registered', { skillId: id, manifest: manifest.getStats() });
    this.logger.info(`[SkillRegistry] Registered skill: ${id} (${skill.definition.name})`);
    
    return manifest.getStats();
  }

  async unregister(skillId) {
    const manifest = this.skills.get(skillId);
    if (!manifest) {
      throw new Error(`Skill ${skillId} not found`);
    }

    // Call onUnload
    await manifest.instance.onUnload();

    // Remove from indexes
    const cat = manifest.definition.category;
    this.categories.get(cat)?.delete(skillId);
    
    for (const perm of manifest.definition.permissions) {
      this.permissions.get(perm)?.delete(skillId);
    }

    this.skills.delete(skillId);
    this.emit('unregistered', { skillId });
    this.logger.info(`[SkillRegistry] Unregistered skill: ${skillId}`);
  }

  get(skillId) {
    const manifest = this.skills.get(skillId);
    return manifest?.instance || null;
  }

  getManifest(skillId) {
    return this.skills.get(skillId) || null;
  }

  has(skillId) {
    return this.skills.has(skillId);
  }

  list(options = {}) {
    let skills = Array.from(this.skills.values()).map(m => m.getStats());
    
    if (options.category) {
      skills = skills.filter(s => {
        const manifest = this.skills.get(s.id);
        return manifest?.definition.category === options.category;
      });
    }
    
    if (options.permission) {
      skills = skills.filter(s => {
        const manifest = this.skills.get(s.id);
        return manifest?.definition.permissions.includes(options.permission);
      });
    }
    
    if (options.experimental === false) {
      skills = skills.filter(s => {
        const manifest = this.skills.get(s.id);
        return !manifest?.definition.experimental;
      });
    }
    
    if (options.deprecated === false) {
      skills = skills.filter(s => {
        const manifest = this.skills.get(s.id);
        return !manifest?.definition.deprecated;
      });
    }

    if (options.sort) {
      skills.sort((a, b) => {
        if (options.sort === 'name') return a.name.localeCompare(b.name);
        if (options.sort === 'category') return a.category.localeCompare(b.category);
        if (options.sort === 'calls') return b.callCount - a.callCount;
        return 0;
      });
    }

    return skills;
  }

  getByCategory(category) {
    const ids = this.categories.get(category) || new Set();
    return Array.from(ids).map(id => this.getManifest(id).getStats());
  }

  getByPermission(permission) {
    const ids = this.permissions.get(permission) || new Set();
    return Array.from(ids).map(id => this.getManifest(id).getStats());
  }

  search(query, options = {}) {
    const lowerQuery = query.toLowerCase();
    const skills = this.list({ ...options, experimental: false, deprecated: false });
    
    return skills.filter(s => {
      const manifest = this.skills.get(s.id);
      const def = manifest.definition;
      return (
        def.id.toLowerCase().includes(lowerQuery) ||
        def.name.toLowerCase().includes(lowerQuery) ||
        def.description.toLowerCase().includes(lowerQuery) ||
        def.keywords.some(k => k.toLowerCase().includes(lowerQuery))
      );
    });
  }

  async loadFromDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillDir = path.join(dirPath, entry.name);
        const manifestPath = path.join(skillDir, 'skill.json');
        const entryPoint = path.join(skillDir, 'index.js');
        
        if (fs.existsSync(manifestPath) && fs.existsSync(entryPoint)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            const module = await import(entryPoint);
            const SkillClass = module.default || module[Object.keys(module).find(k => k.endsWith('Skill'))];
            
            if (SkillClass && SkillClass.prototype instanceof BaseSkill) {
              const skill = new SkillClass();
              // Override definition with manifest if provided
              if (manifest) {
                skill.definition = new SkillDefinition({ ...skill.definition.toJSON(), ...manifest });
              }
              await this.register(skill);
              results.push({ id: skill.definition.id, status: 'loaded' });
            } else {
              results.push({ id: entry.name, status: 'error', error: 'No valid Skill class found' });
            }
          } catch (error) {
            results.push({ id: entry.name, status: 'error', error: error.message });
          }
        }
      }
    }

    return results;
  }

  async loadAllFromDirectory(dirPath) {
    return this.loadFromDirectory(dirPath);
  }

  async execute(skillId, input, executionOptions = {}) {
    const manifest = this.skills.get(skillId);
    if (!manifest) {
      throw new Error(`Skill ${skillId} not found`);
    }

    const skill = manifest.instance;
    const abortController = new AbortController();
    
    const execution = new SkillExecution({
      skillId,
      input: input instanceof SkillInput ? input : new SkillInput(input),
      context: new SkillContext({ ...this.context, skillRegistry: this }),
      abortSignal: abortController.signal
    });

    // Validate input
    const validation = skill.validateInput(execution.input);
    if (!validation.valid) {
      return SkillOutput.error('Invalid input', validation.errors);
    }

    const startTime = Date.now();
    
    try {
      this.emit('execution:start', { skillId, input: execution.input });
      
      let output;
      
      if (executionOptions.stream && typeof skill.streamExecute === 'function') {
        // Streaming execution
        const stream = skill.streamExecute(execution.input, execution);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
          this.emit('execution:chunk', { skillId, chunk });
        }
        output = chunks[chunks.length - 1] || SkillOutput.error('No output from stream');
      } else {
        // Regular execution
        output = await skill.execute(execution.input, execution);
      }

      const duration = Date.now() - startTime;
      manifest.recordCall(duration, output.success ? null : new Error(output.errors?.join(', ') || 'Execution failed'));
      
      this.emit('execution:complete', { skillId, output, duration });
      
      // Cleanup
      await skill.cleanup(execution);
      
      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      manifest.recordCall(duration, error);
      
      this.emit('execution:error', { skillId, error: error.message, duration });
      
      await skill.cleanup(execution);
      
      return SkillOutput.error(error.message, [error.message], { duration });
    }
  }

  async executePipeline(pipeline, initialInput, options = {}) {
    // pipeline: [{ skillId, inputTransform?, outputTransform? }]
    let currentInput = initialInput;
    const results = [];
    
    for (const step of pipeline) {
      const { skillId, inputTransform, outputTransform, condition } = step;
      
      // Check condition
      if (condition && !condition(currentInput, results)) {
        results.push({ skillId, skipped: true });
        continue;
      }
      
      // Transform input
      if (inputTransform) {
        currentInput = inputTransform(currentInput, results);
      }
      
      // Execute
      const output = await this.execute(skillId, currentInput, options);
      results.push({ skillId, output });
      
      // Transform output for next step
      if (outputTransform) {
        currentInput = outputTransform(output, results);
      } else if (output.data) {
        currentInput = { ...currentInput, ...output.data };
      }
      
      // Stop on error if configured
      if (!output.success && options.stopOnError !== false) {
        break;
      }
    }
    
    return results;
  }

  getStats() {
    const skills = Array.from(this.skills.values());
    return {
      total: skills.length,
      byCategory: Object.fromEntries(
        Array.from(this.categories.entries()).map(([cat, ids]) => [cat, ids.size])
      ),
      byPermission: Object.fromEntries(
        Array.from(this.permissions.entries()).map(([perm, ids]) => [perm, ids.size])
      ),
      byRuntime: skills.reduce((acc, m) => {
        acc[m.definition.runtime] = (acc[m.definition.runtime] || 0) + 1;
        return acc;
      }, {}),
      totalCalls: skills.reduce((sum, m) => sum + m.callCount, 0),
      avgDuration: skills.reduce((sum, m) => sum + m.totalDuration, 0) / 
        Math.max(1, skills.reduce((sum, m) => sum + m.callCount, 0)),
      errors: skills.filter(m => m.status === 'error').length
    };
  }

  async healthCheck() {
    const results = {};
    for (const [id, manifest] of this.skills) {
      try {
        results[id] = await manifest.instance.healthCheck();
      } catch (error) {
        results[id] = { healthy: false, error: error.message };
      }
    }
    return results;
  }

  async shutdown() {
    for (const [id, manifest] of this.skills) {
      try {
        await manifest.instance.onUnload();
      } catch (error) {
        this.logger.error(`[SkillRegistry] Error unloading ${id}:`, error.message);
      }
    }
    this.skills.clear();
    this.categories.clear();
    this.permissions.clear();
    this.emit('shutdown');
  }
}

export default SkillRegistry;