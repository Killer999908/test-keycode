/**
 * WebSearchSkill - Search the web for information
 * Provides real-time web search capabilities for the AI builder
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class WebSearchSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'web-search',
      name: 'Web Search',
      description: 'Search the web for real-time information, documentation, and resources',
      version: '1.0.0',
      category: SkillCategory.RESEARCH,
      author: 'KEYCODE',
      keywords: ['search', 'web', 'research', 'information', 'docs'],
      permissions: [SkillPermission.NETWORK],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['duckduckgo', 'google', 'bing', 'serpapi'], default: 'duckduckgo' },
          maxResults: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          safeSearch: { type: 'boolean', default: true },
          region: { type: 'string', default: 'us-en' },
          timeout: { type: 'integer', minimum: 1000, maximum: 30000, default: 10000 }
        }
      },
      defaultConfig: {
        provider: 'duckduckgo',
        maxResults: 10,
        safeSearch: true,
        region: 'us-en',
        timeout: 10000
      },
      examples: [
        { prompt: 'Search for React 18 new features', description: 'Find latest React documentation' },
        { prompt: 'Find PCB design best practices for high frequency', description: 'Technical research' },
        { prompt: 'Search for Tailwind CSS dark mode examples', description: 'Design research' }
      ]
    });
    super(definition);
    this.searchCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async initialize(config, context) {
    await super.initialize(config, context);
    // The API key is optional (DuckDuckGo needs none). Read it straight from
    // the context rather than via getSecret(), which would require the secrets
    // permission and abort initialization on every load.
    this.apiKey = config.apiKey || context?.secrets?.SEARCH_API_KEY || process.env.SEARCH_API_KEY || '';
    this.provider = config.provider || this.config.provider;
  }

  validateInput(input) {
    if (!input.prompt || typeof input.prompt !== 'string') {
      return { valid: false, errors: ['prompt is required and must be a string'] };
    }
    if (input.prompt.length > 500) {
      return { valid: false, errors: ['prompt too long (max 500 chars)'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input, execution) {
    const { prompt, params = {} } = input;
    const maxResults = params.maxResults || this.config.maxResults;
    const provider = params.provider || this.config.provider;

    execution.emit('progress', { stage: 'searching', progress: 0.2, message: `Searching for: ${prompt}` });

    // Check cache
    const cacheKey = `${provider}:${prompt}:${maxResults}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      execution.emit('progress', { stage: 'complete', progress: 1, message: 'Returning cached results' });
      return this._formatOutput(cached.data, prompt, true);
    }

    let results;
    try {
      switch (provider) {
        case 'duckduckgo':
          results = await this._searchDuckDuckGo(prompt, maxResults);
          break;
        case 'google':
          results = await this._searchGoogle(prompt, maxResults);
          break;
        case 'bing':
          results = await this._searchBing(prompt, maxResults);
          break;
        case 'serpapi':
          results = await this._searchSerpApi(prompt, maxResults);
          break;
        default:
          results = await this._searchDuckDuckGo(prompt, maxResults);
      }
    } catch (error) {
      return BaseSkill.createError(`Search failed: ${error.message}`, [error.message]);
    }

    // Cache results
    this.searchCache.set(cacheKey, { data: results, timestamp: Date.now() });

    execution.emit('progress', { stage: 'complete', progress: 1, message: `Found ${results.length} results` });

    return this._formatOutput(results, prompt, false);
  }

  async _searchDuckDuckGo(query, maxResults) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KEYCODE Bot/1.0)' },
      signal: AbortSignal.timeout(this.config.timeout)
    });
    const html = await response.text();
    
    // Parse HTML results
    const results = [];
    const regex = /<a class="result__snippet" href="([^"]+)">([^<]+)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) && results.length < maxResults) {
      results.push({
        title: match[2].replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>'),
        url: match[1],
        snippet: ''
      });
    }
    
    // Also try to get snippets
    const snippetRegex = /<a class="result__snippet" href="[^"]+">[^<]+<\/a>[^<]*<div class="result__snippet">([^<]+)<\/div>/g;
    let snippetMatch;
    let i = 0;
    while ((snippetMatch = snippetRegex.exec(html)) && i < results.length) {
      results[i].snippet = snippetMatch[1].replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
      i++;
    }

    return results;
  }

  async _searchGoogle(query, maxResults) {
    if (!this.apiKey) {
      throw new Error('Google Search API key not configured');
    }
    // Custom Search JSON API
    const cx = this.getSecret('GOOGLE_CSE_ID') || process.env.GOOGLE_CSE_ID;
    const url = `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(this.config.timeout) });
    const data = await response.json();
    
    return (data.items || []).map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }));
  }

  async _searchBing(query, maxResults) {
    if (!this.apiKey) {
      throw new Error('Bing Search API key not configured');
    }
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    
    const response = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
      signal: AbortSignal.timeout(this.config.timeout)
    });
    const data = await response.json();
    
    return (data.webPages?.value || []).map(item => ({
      title: item.name,
      url: item.url,
      snippet: item.snippet
    }));
  }

  async _searchSerpApi(query, maxResults) {
    if (!this.apiKey) {
      throw new Error('SerpAPI key not configured');
    }
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${maxResults}&api_key=${this.apiKey}`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(this.config.timeout) });
    const data = await response.json();
    
    return (data.organic_results || []).map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }));
  }

  _formatOutput(results, query, fromCache) {
    const artifacts = results.map((r, i) => this.createArtifact(
      `result-${i+1}`,
      'search-result',
      r,
      { index: i, query }
    ));

    const text = results.length > 0
      ? `Found ${results.length} results for "${query}"${fromCache ? ' (cached)' : ''}:\n\n` +
        results.map((r, i) => `${i+1}. **${r.title}**\n   ${r.url}\n   ${r.snippet || 'No snippet'}`).join('\n\n')
      : `No results found for "${query}"`;

    return BaseSkill.createSuccess({
      results,
      query,
      count: results.length,
      fromCache
    }, text, { artifacts });
  }

  async healthCheck() {
    try {
      // Test with a simple query
      await this._searchDuckDuckGo('test', 1);
      return { healthy: true, provider: this.provider };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

export default WebSearchSkill;
