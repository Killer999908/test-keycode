/**
 * FileOperationsSkill - Read, write, and manipulate files
 * Provides filesystem operations for the AI builder
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FileOperationsSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'file-operations',
      name: 'File Operations',
      description: 'Read, write, list, copy, move, and delete files in the workspace',
      version: '1.0.0',
      category: SkillCategory.CODE,
      author: 'KEYCODE',
      keywords: ['file', 'read', 'write', 'list', 'copy', 'move', 'delete', 'filesystem'],
      permissions: [SkillPermission.FILESYSTEM],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          workspaceRoot: { type: 'string', default: '' },
          maxFileSize: { type: 'integer', minimum: 1024, maximum: 104857600, default: 10485760 },
          allowedExtensions: { type: 'array', items: { type: 'string' }, default: ['.js', '.ts', '.json', '.html', '.css', '.md', '.txt', '.py', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.fish', '.dockerfile', '.gitignore', '.env', '.svg', '.xml', '.csv', '.sql'] },
          blockedPaths: { type: 'array', items: { type: 'string' }, default: ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.nyc_output'] }
        }
      },
      defaultConfig: {
        workspaceRoot: '',
        maxFileSize: 10485760,
        allowedExtensions: ['.js', '.ts', '.json', '.html', '.css', '.md', '.txt', '.py', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.fish', '.dockerfile', '.gitignore', '.env', '.svg', '.xml', '.csv', '.sql'],
        blockedPaths: ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.nyc_output']
      },
      examples: [
        { prompt: 'Read package.json', description: 'Read a file' },
        { prompt: 'Write hello.js with console.log("Hello World")', description: 'Write a file' },
        { prompt: 'List files in src/', description: 'List directory' },
        { prompt: 'Create directory components/ui', description: 'Create directory' }
      ]
    });
    super(definition);
  }

  async initialize(config, context) {
    await super.initialize(config, context);
    this.workspaceRoot = config.workspaceRoot || this.config.workspaceRoot || process.cwd();
  }

  validateInput(input) {
    if (!input.params?.operation) {
      return { valid: false, errors: ['operation is required (read, write, list, delete, copy, move, mkdir, exists, stat)'] };
    }
    const validOps = ['read', 'write', 'list', 'delete', 'copy', 'move', 'mkdir', 'exists', 'stat', 'append'];
    if (!validOps.includes(input.params.operation)) {
      return { valid: false, errors: [`invalid operation: ${input.params.operation}. Valid: ${validOps.join(', ')}`] };
    }
    if (!input.params.path && input.params.operation !== 'list') {
      return { valid: false, errors: ['path is required for this operation'] };
    }
    return { valid: true, errors: [] };
  }

  _resolvePath(inputPath) {
    const resolved = path.resolve(this.workspaceRoot, inputPath);
    const relative = path.relative(this.workspaceRoot, resolved);
    
    // Check for path traversal
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path traversal not allowed');
    }
    
    // Check blocked paths
    for (const blocked of this.config.blockedPaths) {
      if (relative.startsWith(blocked + path.sep) || relative === blocked) {
        throw new Error(`Access to ${blocked} is blocked`);
      }
    }
    
    return resolved;
  }

  _checkExtension(filePath) {
    const ext = path.extname(filePath);
    if (ext && this.config.allowedExtensions.length > 0) {
      if (!this.config.allowedExtensions.includes(ext)) {
        throw new Error(`File extension ${ext} not allowed`);
      }
    }
  }

  async execute(input, execution) {
    const { operation, path: inputPath, content, encoding = 'utf-8', recursive = false, force = false } = input.params;
    const resolvedPath = this._resolvePath(inputPath);
    
    execution.emit('progress', { stage: 'processing', progress: 0.3, message: `${operation} ${inputPath}` });

    try {
      let result;
      
      switch (operation) {
        case 'read': {
          this._checkExtension(resolvedPath);
          const stats = await fs.promises.stat(resolvedPath);
          if (stats.size > this.config.maxFileSize) {
            throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
          }
          result = await fs.promises.readFile(resolvedPath, encoding);
          break;
        }
        case 'write': {
          this._checkExtension(resolvedPath);
          await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.promises.writeFile(resolvedPath, content ?? '', encoding);
          result = { written: true, path: inputPath };
          break;
        }
        case 'append': {
          this._checkExtension(resolvedPath);
          await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.promises.appendFile(resolvedPath, content ?? '', encoding);
          result = { appended: true, path: inputPath };
          break;
        }
        case 'list': {
          const targetPath = inputPath ? resolvedPath : this.workspaceRoot;
          const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
          result = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
            path: inputPath ? path.join(inputPath, e.name) : e.name
          }));
          break;
        }
        case 'delete': {
          const stats = await fs.promises.stat(resolvedPath);
          if (stats.isDirectory()) {
            await fs.promises.rm(resolvedPath, { recursive, force });
          } else {
            await fs.promises.unlink(resolvedPath);
          }
          result = { deleted: true, path: inputPath };
          break;
        }
        case 'copy': {
          if (!input.params.destination) throw new Error('destination is required for copy');
          const destPath = this._resolvePath(input.params.destination);
          this._checkExtension(destPath);
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
          await fs.promises.copyFile(resolvedPath, destPath);
          result = { copied: true, from: inputPath, to: input.params.destination };
          break;
        }
        case 'move': {
          if (!input.params.destination) throw new Error('destination is required for move');
          const destPath = this._resolvePath(input.params.destination);
          this._checkExtension(destPath);
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
          await fs.promises.rename(resolvedPath, destPath);
          result = { moved: true, from: inputPath, to: input.params.destination };
          break;
        }
        case 'mkdir': {
          await fs.promises.mkdir(resolvedPath, { recursive: true });
          result = { created: true, path: inputPath };
          break;
        }
        case 'exists': {
          try {
            await fs.promises.access(resolvedPath);
            result = { exists: true, path: inputPath };
          } catch {
            result = { exists: false, path: inputPath };
          }
          break;
        }
        case 'stat': {
          const stats = await fs.promises.stat(resolvedPath);
          result = {
            path: inputPath,
            size: stats.size,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            permissions: stats.mode.toString(8).slice(-3)
          };
          break;
        }
      }

      execution.emit('progress', { stage: 'complete', progress: 1, message: 'Operation complete' });

      const artifacts = [];
      if (operation === 'read' && typeof result === 'string') {
        artifacts.push(this.createArtifact('content', 'text', result, { path: inputPath }));
      } else if (operation === 'list' && Array.isArray(result)) {
        artifacts.push(this.createArtifact('listing', 'json', result, { path: inputPath }));
      }

      const text = this._formatOutput(operation, inputPath, result);
      
      return BaseSkill.createSuccess({ ...result, operation, path: inputPath }, text, { artifacts });
    } catch (error) {
      return BaseSkill.createError(`File operation failed: ${error.message}`, [error.message]);
    }
  }

  _formatOutput(operation, inputPath, result) {
    switch (operation) {
      case 'read':
        return `📄 **Read:** \`${inputPath}\`\n\`\`\`\n${result}\n\`\`\``;
      case 'write':
        return `✍️ **Written:** \`${inputPath}\``;
      case 'append':
        return `➕ **Appended to:** \`${inputPath}\``;
      case 'list':
        const files = result.filter(f => f.type === 'file').length;
        const dirs = result.filter(f => f.type === 'directory').length;
        return `📁 **List:** \`${inputPath}\` (${files} files, ${dirs} dirs)\n\n` + 
          result.map(f => `${f.type === 'directory' ? '📁' : '📄'} ${f.name}`).join('\n');
      case 'delete':
        return `🗑️ **Deleted:** \`${inputPath}\``;
      case 'copy':
        return `📋 **Copied:** \`${inputPath}\` → \`${result.to}\``;
      case 'move':
        return `📦 **Moved:** \`${inputPath}\` → \`${result.to}\``;
      case 'mkdir':
        return `📁 **Created directory:** \`${inputPath}\``;
      case 'exists':
        return `${result.exists ? '✅' : '❌'} **Exists:** \`${inputPath}\` = ${result.exists}`;
      case 'stat':
        return `📊 **Stat:** \`${inputPath}\`\n- Size: ${result.size} bytes\n- Type: ${result.isDirectory ? 'Directory' : 'File'}\n- Modified: ${result.modified}`;
      default:
        return `Operation ${operation} completed`;
    }
  }

  async healthCheck() {
    try {
      await fs.promises.access(this.workspaceRoot);
      return { healthy: true, workspaceRoot: this.workspaceRoot };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

export default FileOperationsSkill;
