/**
 * Skill System Types - Core definitions for the AI Builder skill framework
 * Skills are modular capabilities that can be composed and executed by the AI
 */

export const SkillCategory = {
  RESEARCH: 'research',
  CODE: 'code',
  DESIGN: 'design',
  DATA: 'data',
  AUTOMATION: 'automation',
  INTEGRATION: 'integration',
  ANALYSIS: 'analysis',
  CREATIVE: 'creative',
  INFRASTRUCTURE: 'infrastructure',
  SECURITY: 'security',
  CUSTOM: 'custom'
};

export const SkillPermission = {
  NETWORK: 'network',           // Can make HTTP requests
  FILESYSTEM: 'filesystem',     // Can read/write files
  SHELL: 'shell',               // Can execute commands
  DATABASE: 'database',         // Can query databases
  AI_MODEL: 'ai_model',         // Can call other AI models
  SECRETS: 'secrets',           // Can access environment secrets
  USER_DATA: 'user_data',       // Can access user-specific data
  BILLING: 'billing'            // Can trigger billable operations
};

export const SkillRuntime = {
  NODE: 'node',
  PYTHON: 'python',
  DENO: 'deno',
  BUN: 'bun',
  WASM: 'wasm',
  NATIVE: 'native'
};

export class SkillDefinition {
  constructor({
    id,
    name,
    description,
    version = '1.0.0',
    category = SkillCategory.CUSTOM,
    author = 'KEYCODE',
    license = 'MIT',
    homepage = '',
    repository = '',
    keywords = [],
    permissions = [],
    runtime = SkillRuntime.NODE,
    entryPoint = 'index.js',
    configSchema = {},
    defaultConfig = {},
    dependencies = {},
    devDependencies = {},
    peerDependencies = {},
    engine = { node: '>=18.0.0' },
    manifests = {},
    examples = [],
    changelog = '',
    deprecated = false,
    experimental = false
  } = {}) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.version = version;
    this.category = category;
    this.author = author;
    this.license = license;
    this.homepage = homepage;
    this.repository = repository;
    this.keywords = keywords;
    this.permissions = permissions;
    this.runtime = runtime;
    this.entryPoint = entryPoint;
    this.configSchema = configSchema;
    this.defaultConfig = defaultConfig;
    this.dependencies = dependencies;
    this.devDependencies = devDependencies;
    this.peerDependencies = peerDependencies;
    this.engine = engine;
    this.manifests = manifests;
    this.examples = examples;
    this.changelog = changelog;
    this.deprecated = deprecated;
    this.experimental = experimental;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  validate() {
    const errors = [];
    if (!this.id || !/^[a-z0-9-]+$/.test(this.id)) {
      errors.push('id must be lowercase alphanumeric with hyphens');
    }
    if (!this.name) errors.push('name is required');
    if (!this.description) errors.push('description is required');
    if (!Object.values(SkillCategory).includes(this.category)) {
      errors.push(`invalid category: ${this.category}`);
    }
    if (!Object.values(SkillRuntime).includes(this.runtime)) {
      errors.push(`invalid runtime: ${this.runtime}`);
    }
    for (const perm of this.permissions) {
      if (!Object.values(SkillPermission).includes(perm)) {
        errors.push(`invalid permission: ${perm}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return { ...this };
  }
}

export class SkillContext {
  constructor({
    sessionId,
    userId,
    projectId,
    workspacePath,
    config = {},
    secrets = {},
    logger,
    apiClient,
    db,
    cache,
    eventBus,
    skillRegistry
  } = {}) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.projectId = projectId;
    this.workspacePath = workspacePath;
    this.config = config;
    this.secrets = secrets;
    this.logger = logger || console;
    this.apiClient = apiClient;
    this.db = db;
    this.cache = cache;
    this.eventBus = eventBus;
    this.skillRegistry = skillRegistry;
    this.startTime = Date.now();
    this.metadata = new Map();
  }

  getElapsed() {
    return Date.now() - this.startTime;
  }

  setMetadata(key, value) {
    this.metadata.set(key, value);
  }

  getMetadata(key) {
    return this.metadata.get(key);
  }
}

export class SkillInput {
  constructor({
    prompt,
    params = {},
    files = [],
    images = [],
    context = {},
    history = [],
    streaming = false
  } = {}) {
    this.prompt = prompt;
    this.params = params;
    this.files = files;
    this.images = images;
    this.context = context;
    this.history = history;
    this.streaming = streaming;
  }
}

export class SkillOutput {
  constructor({
    success = true,
    data = null,
    text = '',
    files = [],
    artifacts = [],
    usage = { tokens: 0, cost: 0, duration: 0 },
    metadata = {},
    nextActions = [],
    errors = [],
    warnings = []
  } = {}) {
    this.success = success;
    this.data = data;
    this.text = text;
    this.files = files;
    this.artifacts = artifacts;
    this.usage = usage;
    this.metadata = metadata;
    this.nextActions = nextActions;
    this.errors = errors;
    this.warnings = warnings;
    this.timestamp = new Date().toISOString();
  }

  static error(message, errors = [], metadata = {}) {
    return new SkillOutput({
      success: false,
      text: message,
      errors: Array.isArray(errors) ? errors : [errors],
      metadata
    });
  }

  static success(data, text = '', metadata = {}) {
    return new SkillOutput({
      success: true,
      data,
      text,
      metadata
    });
  }
}

export class SkillExecution {
  constructor({
    skillId,
    input,
    context,
    abortSignal
  }) {
    this.skillId = skillId;
    this.input = input;
    this.context = context;
    this.abortSignal = abortSignal;
    this.startTime = Date.now();
    this.events = [];
    this.checkpoints = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
    if (this.context.eventBus) {
      this.context.eventBus.emit(`skill.${this.skillId}.${event}`, data);
    }
  }

  checkpoint(name, data) {
    this.checkpoints.push({ name, data, timestamp: Date.now() });
  }

  getDuration() {
    return Date.now() - this.startTime;
  }

  isAborted() {
    return this.abortSignal?.aborted ?? false;
  }
}

export class SkillManifest {
  constructor(definition, instance) {
    this.definition = definition;
    this.instance = instance;
    this.loadedAt = new Date().toISOString();
    this.status = 'loaded'; // loaded, error, unloaded
    this.error = null;
    this.callCount = 0;
    this.totalDuration = 0;
    this.lastError = null;
    this.lastCalledAt = null;
  }

  recordCall(duration, error = null) {
    this.callCount++;
    this.totalDuration += duration;
    this.lastCalledAt = new Date().toISOString();
    if (error) {
      this.lastError = error.message;
      this.status = 'error';
    }
  }

  getStats() {
    return {
      id: this.definition.id,
      name: this.definition.name,
      version: this.definition.version,
      status: this.status,
      callCount: this.callCount,
      avgDuration: this.callCount > 0 ? this.totalDuration / this.callCount : 0,
      lastCalledAt: this.lastCalledAt,
      lastError: this.lastError
    };
  }
}