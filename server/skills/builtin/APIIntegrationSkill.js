/**
 * APIIntegrationSkill - Call external APIs and integrate with services
 * Provides HTTP client capabilities for the AI builder
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class APIIntegrationSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'api-integration',
      name: 'API Integration',
      description: 'Call REST APIs, GraphQL endpoints, and integrate with external services',
      version: '1.0.0',
      category: SkillCategory.INTEGRATION,
      author: 'KEYCODE',
      keywords: ['api', 'http', 'rest', 'graphql', 'webhook', 'integration', 'fetch'],
      permissions: [SkillPermission.NETWORK, SkillPermission.SECRETS],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          defaultTimeout: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
          maxResponseSize: { type: 'integer', minimum: 1024, maximum: 104857600, default: 10485760 },
          allowedDomains: { type: 'array', items: { type: 'string' }, default: [] },
          blockedDomains: { type: 'array', items: { type: 'string' }, default: ['localhost', '127.0.0.1', '0.0.0.0', '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'] },
          followRedirects: { type: 'boolean', default: true },
          maxRedirects: { type: 'integer', minimum: 0, maximum: 20, default: 10 }
        }
      },
      defaultConfig: {
        defaultTimeout: 30000,
        maxResponseSize: 10485760,
        allowedDomains: [],
        blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0', '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'],
        followRedirects: true,
        maxRedirects: 10
      },
      examples: [
        { prompt: 'GET https://api.github.com/users/octocat', description: 'Simple GET request' },
        { prompt: 'POST to https://api.example.com/webhook with JSON body', description: 'POST with body' },
        { prompt: 'GraphQL query to https://api.github.com/graphql', description: 'GraphQL request' }
      ]
    });
    super(definition);
    this.client = null;
  }

  async initialize(config, context) {
    await super.initialize(config, context);
    // Use context apiClient if available, otherwise create our own
    this.client = context.apiClient || this._createDefaultClient();
  }

  _createDefaultClient() {
    return {
      async request(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
        
        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: options.followRedirects !== false ? 'follow' : 'manual'
          });
          
          clearTimeout(timeout);
          
          const contentType = response.headers.get('content-type') || '';
          let data;
          if (contentType.includes('application/json')) {
            data = await response.json();
          } else if (contentType.includes('text/')) {
            data = await response.text();
          } else {
            data = await response.arrayBuffer();
          }
          
          return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data,
            ok: response.ok
          };
        } catch (error) {
          clearTimeout(timeout);
          throw error;
        }
      }
    };
  }

  _checkDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      
      // Check blocked domains (including private IPs)
      for (const blocked of this.config.blockedDomains) {
        if (hostname === blocked || hostname.endsWith('.' + blocked) || hostname.startsWith(blocked)) {
          throw new Error(`Domain blocked: ${hostname}`);
        }
      }
      
      // Check allowed domains if specified
      if (this.config.allowedDomains.length > 0) {
        const allowed = this.config.allowedDomains.some(d => 
          hostname === d || hostname.endsWith('.' + d)
        );
        if (!allowed) {
          throw new Error(`Domain not in allowed list: ${hostname}`);
        }
      }
      
      return true;
    } catch (error) {
      if (error.message.includes('blocked') || error.message.includes('allowed')) {
        throw error;
      }
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  _getSecret(key) {
    return this.getSecret(key) || process.env[key];
  }

  _interpolateSecrets(obj) {
    if (typeof obj === 'string') {
      // Replace {{SECRET_NAME}} with actual secret
      return obj.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = this._getSecret(key);
        return value !== undefined ? value : match;
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this._interpolateSecrets(item));
    }
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this._interpolateSecrets(value);
      }
      return result;
    }
    return obj;
  }

  validateInput(input) {
    if (!input.params?.url && !input.prompt?.includes('http')) {
      return { valid: false, errors: ['url is required in params or prompt must contain a URL'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const { url, method = 'GET', headers = {}, body, params, timeout, followRedirects, maxRedirects } = input.params;
    const requestUrl = url || this._extractUrl(input.prompt);
    
    if (!requestUrl) {
      return BaseSkill.createError('No URL provided', ['URL is required']);
    }

    this._checkDomain(requestUrl);
    
    execution.emit('progress', { stage: 'preparing', progress: 0.2, message: `Preparing ${method} ${requestUrl}` });

    // Interpolate secrets in headers and body
    const finalHeaders = this._interpolateSecrets({
      'User-Agent': 'KEYCODE-AI-Builder/1.0',
      'Accept': 'application/json, text/*, */*',
      ...headers
    });
    
    const finalBody = body ? this._interpolateSecrets(body) : undefined;
    const finalParams = params ? this._interpolateSecrets(params) : undefined;

    // Build final URL with query params
    let finalUrl = requestUrl;
    if (finalParams && method === 'GET') {
      const searchParams = new URLSearchParams(finalParams);
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + searchParams.toString();
    }

    const requestOptions = {
      method: method.toUpperCase(),
      headers: finalHeaders,
      timeout: timeout || this.config.defaultTimeout,
      followRedirects: followRedirects ?? this.config.followRedirects,
      maxRedirects: maxRedirects ?? this.config.maxRedirects
    };

    if (finalBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
      if (typeof finalBody === 'object') {
        requestOptions.headers['Content-Type'] = 'application/json';
        requestOptions.body = JSON.stringify(finalBody);
      } else {
        requestOptions.body = finalBody;
      }
    }

    try {
      execution.emit('progress', { stage: 'requesting', progress: 0.5, message: 'Sending request...' });
      
      const response = await this.client.request(finalUrl, requestOptions);
      
      execution.emit('progress', { stage: 'processing', progress: 0.8, message: 'Processing response...' });

      // Check response size
      const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (responseText.length > this.config.maxResponseSize) {
        throw new Error(`Response too large: ${responseText.length} bytes`);
      }

      execution.emit('progress', { stage: 'complete', progress: 1, message: `Response: ${response.status}` });

      const artifacts = [
        this.createArtifact('response', 'json', {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data
        }, { url: requestUrl, method })
      ];

      const success = response.ok;
      const text = success
        ? `✅ **${method} ${requestUrl}** → ${response.status} ${response.statusText}\n\n**Response:**\n\`\`\`json\n${JSON.stringify(response.data, null, 2).slice(0, 5000)}\n\`\`\``
        : `❌ **${method} ${requestUrl}** → ${response.status} ${response.statusText}\n\n**Error:**\n\`\`\`\n${responseText.slice(0, 5000)}\n\`\`\``;

      return BaseSkill.createSuccess({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: requestUrl,
        method,
        ok: success
      }, text, { artifacts });
    } catch (error) {
      return BaseSkill.createError(`API request failed: ${error.message}`, [error.message], { url: requestUrl, method });
    }
  }

  _extractUrl(prompt) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const matches = prompt.match(urlRegex);
    return matches?.[0];
  }

  async healthCheck() {
    try {
      const response = await this.client.request('https://httpbin.org/get', { timeout: 5000 });
      return { healthy: response.ok, status: response.status };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

export default APIIntegrationSkill;
