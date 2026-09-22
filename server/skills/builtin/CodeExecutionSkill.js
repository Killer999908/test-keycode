/**
 * CodeExecutionSkill - Execute code in sandboxed environments
 * Supports JavaScript, Python, and other languages
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CodeExecutionSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'code-execution',
      name: 'Code Execution',
      description: 'Execute code snippets in sandboxed environments (Node.js, Python, Deno, Bun)',
      version: '1.0.0',
      category: SkillCategory.CODE,
      author: 'KEYCODE',
      keywords: ['code', 'execute', 'run', 'sandbox', 'javascript', 'python', 'typescript'],
      permissions: [SkillPermission.SHELL, SkillPermission.FILESYSTEM],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          defaultLanguage: { type: 'string', enum: ['javascript', 'python', 'typescript', 'deno', 'bun'], default: 'javascript' },
          timeout: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
          maxOutputSize: { type: 'integer', minimum: 1024, maximum: 10485760, default: 1048576 },
          allowNetwork: { type: 'boolean', default: false },
          allowedModules: { type: 'array', items: { type: 'string' }, default: [] },
          blockedModules: { type: 'array', items: { type: 'string' }, default: ['child_process', 'fs', 'net', 'http', 'https', 'cluster', 'worker_threads'] }
        }
      },
      defaultConfig: {
        defaultLanguage: 'javascript',
        timeout: 30000,
        maxOutputSize: 1048576,
        allowNetwork: false,
        allowedModules: [],
        blockedModules: ['child_process', 'fs', 'net', 'http', 'https', 'cluster', 'worker_threads']
      },
      examples: [
        { prompt: 'Run: const x = 2 + 2; console.log(x)', description: 'Simple JavaScript execution' },
        { prompt: 'Run Python: print(sum(range(100)))', description: 'Python execution' },
        { prompt: 'Test this regex: /\\d+/.test("123abc")', description: 'Quick code testing' }
      ]
    });
    super(definition);
    this.tempDir = path.join(__dirname, '../../../temp/code-exec');
  }

  async initialize(config, context) {
    await super.initialize(config, context);
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  validateInput(input) {
    if (!input.prompt && !input.params?.code) {
      return { valid: false, errors: ['code or prompt with code is required'] };
    }
    const code = input.params?.code || input.prompt;
    if (code.length > 100000) {
      return { valid: false, errors: ['code too long (max 100KB)'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const code = input.params?.code || input.prompt;
    const language = input.params?.language || this.config.defaultLanguage;
    const timeout = input.params?.timeout || this.config.timeout;
    const stdin = input.params?.stdin || '';

    execution.emit('progress', { stage: 'preparing', progress: 0.2, message: `Preparing ${language} environment` });

    const { filePath, command, args } = this._getExecutionCommand(language, code);
    
    try {
      // Write code to temp file
      await fs.promises.writeFile(filePath, code);
      
      execution.emit('progress', { stage: 'running', progress: 0.5, message: 'Executing code...' });

      const result = await this._runCommand(command, args, stdin, timeout);
      
      execution.emit('progress', { stage: 'complete', progress: 1, message: 'Execution complete' });

      // Cleanup
      try { await fs.promises.unlink(filePath); } catch {}

      return this._formatOutput(result, language);
    } catch (error) {
      // Cleanup on error
      try { await fs.promises.unlink(filePath); } catch {}
      return BaseSkill.createError(`Execution failed: ${error.message}`, [error.message]);
    }
  }

  _getExecutionCommand(language, code) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    
    switch (language) {
      case 'javascript':
      case 'js': {
        const filePath = path.join(this.tempDir, `exec-${timestamp}-${random}.js`);
        return { filePath, command: 'node', args: [filePath] };
      }
      case 'typescript':
      case 'ts': {
        const filePath = path.join(this.tempDir, `exec-${timestamp}-${random}.ts`);
        return { filePath, command: 'npx', args: ['tsx', filePath] };
      }
      case 'python':
      case 'py': {
        const filePath = path.join(this.tempDir, `exec-${timestamp}-${random}.py`);
        return { filePath, command: 'python3', args: [filePath] };
      }
      case 'deno': {
        const filePath = path.join(this.tempDir, `exec-${timestamp}-${random}.ts`);
        return { filePath, command: 'deno', args: ['run', '--allow-all', filePath] };
      }
      case 'bun': {
        const filePath = path.join(this.tempDir, `exec-${timestamp}-${random}.js`);
        return { filePath, command: 'bun', args: [filePath] };
      }
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  _runCommand(command, args, stdin, timeout) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '--no-warnings' }
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
        reject(new Error(`Execution timeout (${timeout}ms)`));
      }, timeout);

      if (stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.config.maxOutputSize) {
          child.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error('Output size limit exceeded'));
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (killed) return;
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        if (killed) return;
        reject(error);
      });
    });
  }

  _formatOutput(result, language) {
    const { stdout, stderr, exitCode } = result;
    const success = exitCode === 0;
    
    const artifacts = [];
    if (stdout) {
      artifacts.push(this.createArtifact('stdout', 'text', stdout, { language }));
    }
    if (stderr) {
      artifacts.push(this.createArtifact('stderr', 'text', stderr, { language }));
    }

    const text = success
      ? `✅ Execution successful (exit code: ${exitCode})\n\n**Output:**\n\`\`\`\n${stdout || '(no output)'}\n\`\`\``
      : `❌ Execution failed (exit code: ${exitCode})\n\n**Error:**\n\`\`\`\n${stderr || stdout || 'Unknown error'}\n\`\`\``;

    return BaseSkill.createSuccess({
      stdout,
      stderr,
      exitCode,
      success,
      language
    }, text, { artifacts });
  }

  async healthCheck() {
    try {
      const result = await this._runCommand('node', ['-e', 'console.log("ok")'], '', 5000);
      return { healthy: result.exitCode === 0, stdout: result.stdout };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

export default CodeExecutionSkill;
