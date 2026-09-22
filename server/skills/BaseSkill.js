/**
 * BaseSkill - Abstract base class for all skills
 * Provides common functionality and enforces the skill interface
 */

import { SkillDefinition, SkillContext, SkillInput, SkillOutput, SkillExecution } from './types.js';

export class BaseSkill {
  constructor(definition) {
    if (this.constructor === BaseSkill) {
      throw new Error('BaseSkill is abstract and cannot be instantiated directly');
    }
    
    this.definition = definition instanceof SkillDefinition ? definition : new SkillDefinition(definition);
    this.initialized = false;
    this.config = {};
  }

  /**
   * Initialize the skill with configuration
   * Override in subclasses for custom initialization
   */
  async initialize(config = {}, context) {
    this.config = { ...this.definition.defaultConfig, ...config };
    this.initialized = true;
    this.context = context;
    return { success: true };
  }

  /**
   * Main execution method - must be implemented by subclasses
   * @param {SkillInput} input - The input to the skill
   * @param {SkillExecution} execution - Execution context with events/checkpoints
   * @returns {Promise<SkillOutput>}
   */
  async execute(input, execution) {
    throw new Error(`${this.definition.id}: execute() must be implemented`);
  }

  /**
   * Validate input before execution
   * Override for custom validation
   */
  validateInput(input) {
    return { valid: true, errors: [] };
  }

  /**
   * Cleanup resources after execution
   * Override for custom cleanup
   */
  async cleanup(execution) {
    // Default: no-op
  }

  /**
   * Get skill health status
   */
  async healthCheck() {
    return { healthy: true, details: {} };
  }

  /**
   * Get skill configuration schema
   */
  getConfigSchema() {
    return this.definition.configSchema;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return { success: true, config: this.getConfig() };
  }

  /**
   * Stream output for long-running skills
   * Override to support streaming
   */
  async *streamExecute(input, execution) {
    const output = await this.execute(input, execution);
    yield output;
  }

  /**
   * Get skill metadata for marketplace/discovery
   */
  getMetadata() {
    return {
      id: this.definition.id,
      name: this.definition.name,
      description: this.definition.description,
      version: this.definition.version,
      category: this.definition.category,
      author: this.definition.author,
      license: this.definition.license,
      homepage: this.definition.homepage,
      repository: this.definition.repository,
      keywords: this.definition.keywords,
      permissions: this.definition.permissions,
      runtime: this.definition.runtime,
      dependencies: this.definition.dependencies,
      examples: this.definition.examples,
      deprecated: this.definition.deprecated,
      experimental: this.definition.experimental
    };
  }

  /**
   * Called when skill is loaded into registry
   */
  async onLoad(registry) {
    // Default: no-op
  }

  /**
   * Called when skill is unloaded from registry
   */
  async onUnload() {
    // Default: no-op
  }

  /**
   * Helper: Create a success output
   */
  static createSuccess(data, text = '', metadata = {}) {
    return SkillOutput.success(data, text, metadata);
  }

  /**
   * Helper: Create an error output
   */
  static createError(message, errors = [], metadata = {}) {
    return SkillOutput.error(message, errors, metadata);
  }

  /**
   * Helper: Check if skill has permission
   */
  hasPermission(permission) {
    return this.definition.permissions.includes(permission);
  }

  /**
   * Helper: Require permission (throws if not granted)
   */
  requirePermission(permission) {
    if (!this.hasPermission(permission)) {
      throw new Error(`Skill ${this.definition.id} requires permission: ${permission}`);
    }
  }

  /**
   * Helper: Access secret (only if SECRETS permission granted)
   */
  getSecret(key) {
    this.requirePermission('secrets');
    return this.context?.secrets?.[key];
  }

  /**
   * Helper: Make HTTP request (only if NETWORK permission granted)
   */
  async httpRequest(url, options = {}) {
    this.requirePermission('network');
    if (!this.context?.apiClient) {
      throw new Error('No HTTP client available in context');
    }
    return this.context.apiClient.request(url, options);
  }

  /**
   * Helper: Read file (only if FILESYSTEM permission granted)
   */
  async readFile(path) {
    this.requirePermission('filesystem');
    if (!this.context?.db) {
      throw new Error('No filesystem access available in context');
    }
    // Implementation depends on context
    return this.context.db.readFile?.(path);
  }

  /**
   * Helper: Write file (only if FILESYSTEM permission granted)
   */
  async writeFile(path, content) {
    this.requirePermission('filesystem');
    if (!this.context?.db) {
      throw new Error('No filesystem access available in context');
    }
    return this.context.db.writeFile?.(path, content);
  }

  /**
   * Helper: Execute shell command (only if SHELL permission granted)
   */
  async exec(command, args = [], options = {}) {
    this.requirePermission('shell');
    if (!this.context?.db) {
      throw new Error('No shell access available in context');
    }
    return this.context.db.exec?.(command, args, options);
  }

  /**
   * Helper: Query database (only if DATABASE permission granted)
   */
  async queryDatabase(query, params = []) {
    this.requirePermission('database');
    if (!this.context?.db) {
      throw new Error('No database access available in context');
    }
    return this.context.db.query?.(query, params);
  }

  /**
   * Helper: Call another AI model (only if AI_MODEL permission granted)
   */
  async callAIModel(prompt, options = {}) {
    this.requirePermission('ai_model');
    if (!this.context?.apiClient) {
      throw new Error('No AI client available in context');
    }
    return this.context.apiClient.callModel?.(prompt, options);
  }

  /**
   * Helper: Emit progress event
   */
  emitProgress(execution, stage, progress, message = '') {
    execution.emit('progress', { stage, progress, message, timestamp: Date.now() });
  }

  /**
   * Helper: Create artifact
   */
  createArtifact(name, type, content, metadata = {}) {
    return { name, type, content, metadata, createdAt: new Date().toISOString() };
  }
}

export default BaseSkill;