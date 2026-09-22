/**
 * DataAnalysisSkill - Analyze and process data
 * Provides data analysis capabilities for the AI builder
 */

import { BaseSkill } from '../BaseSkill.js';
import { SkillDefinition, SkillCategory, SkillPermission, SkillRuntime } from '../types.js';

export class DataAnalysisSkill extends BaseSkill {
  constructor() {
    const definition = new SkillDefinition({
      id: 'data-analysis',
      name: 'Data Analysis',
      description: 'Analyze, transform, and visualize data (CSV, JSON, arrays, statistics)',
      version: '1.0.0',
      category: SkillCategory.DATA,
      author: 'KEYCODE',
      keywords: ['data', 'analysis', 'statistics', 'csv', 'json', 'transform', 'aggregate', 'chart'],
      permissions: [],
      runtime: SkillRuntime.NODE,
      configSchema: {
        type: 'object',
        properties: {
          maxRows: { type: 'integer', minimum: 100, maximum: 1000000, default: 100000 },
          maxColumns: { type: 'integer', minimum: 10, maximum: 1000, default: 500 },
          precision: { type: 'integer', minimum: 0, maximum: 15, default: 4 }
        }
      },
      defaultConfig: {
        maxRows: 100000,
        maxColumns: 500,
        precision: 4
      },
      examples: [
        { prompt: 'Analyze this CSV: name,age\nJohn,25\nJane,30', description: 'Basic CSV analysis' },
        { prompt: 'Calculate statistics for [1,2,3,4,5,6,7,8,9,10]', description: 'Array statistics' },
        { prompt: 'Group by category and sum values', description: 'Data aggregation' }
      ]
    });
    super(definition);
  }

  validateInput(input) {
    if (!input.params?.operation) {
      return { valid: false, errors: ['operation is required (stats, aggregate, filter, transform, parse, visualize)'] };
    }
    const validOps = ['stats', 'aggregate', 'filter', 'transform', 'parse', 'visualize', 'correlate', 'regression'];
    if (!validOps.includes(input.params.operation)) {
      return { valid: false, errors: [`invalid operation: ${input.params.operation}. Valid: ${validOps.join(', ')}`] };
    }
    if (!input.params.data && !input.prompt) {
      return { valid: false, errors: ['data is required in params or prompt'] };
    }
    return { valid: true, errors: [] };
  }

  _parseData(data) {
    if (Array.isArray(data)) return data;
    if (typeof data === 'string') {
      if (data.includes(',') && data.includes('\n')) {
        return this._parseCSV(data);
      }
      try {
        return JSON.parse(data);
      } catch {}
    }
    if (data && typeof data === 'object') return data;
    throw new Error('Unable to parse data');
  }

  _parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, j) => { row[h] = values[j]; });
      rows.push(row);
    }
    return rows;
  }

  _toNumber(val) {
    const n = Number(val);
    return isNaN(n) ? null : n;
  }

  _getNumericArray(data, key) {
    if (Array.isArray(data) && typeof data[0] === 'number') return data;
    if (Array.isArray(data) && key) return data.map(d => this._toNumber(d[key])).filter(v => v !== null);
    return [];
  }

  async execute(input, execution) {
    const { operation, data, params = {} } = input.params;
    const parsedData = this._parseData(data || input.prompt);

    execution.emit('progress', { stage: 'analyzing', progress: 0.3, message: `Running ${operation} analysis` });

    try {
      let result;
      
      switch (operation) {
        case 'stats':
          result = this._calculateStats(parsedData, params);
          break;
        case 'aggregate':
          result = this._aggregate(parsedData, params);
          break;
        case 'filter':
          result = this._filter(parsedData, params);
          break;
        case 'transform':
          result = this._transform(parsedData, params);
          break;
        case 'parse':
          result = { parsed: parsedData, sample: Array.isArray(parsedData) ? parsedData.slice(0, 5) : parsedData };
          break;
        case 'visualize':
          result = this._visualize(parsedData, params);
          break;
        case 'correlate':
          result = this._correlate(parsedData, params);
          break;
        case 'regression':
          result = this._regression(parsedData, params);
          break;
      }

      execution.emit('progress', { stage: 'complete', progress: 1, message: 'Analysis complete' });

      const artifacts = [
        this.createArtifact('result', 'json', result, { operation })
      ];

      const text = `📊 **Data Analysis: ${operation}**\n\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 5000)}\n\`\`\``;

      return BaseSkill.createSuccess({ result, operation }, text, { artifacts });
    } catch (error) {
      return BaseSkill.createError(`Analysis failed: ${error.message}`, [error.message]);
    }
  }

  _calculateStats(data, params) {
    const key = params.key;
    const arr = this._getNumericArray(data, key);
    
    if (arr.length === 0) return { error: 'No numeric data found' };

    const sorted = [...arr].sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: arr.length,
      sum: this._round(sum),
      mean: this._round(mean),
      median: this._round(sorted[Math.floor(sorted.length / 2)]),
      min: this._round(sorted[0]),
      max: this._round(sorted[sorted.length - 1]),
      stdDev: this._round(stdDev),
      variance: this._round(variance),
      q1: this._round(sorted[Math.floor(sorted.length * 0.25)]),
      q3: this._round(sorted[Math.floor(sorted.length * 0.75)])
    };
  }

  _aggregate(data, params) {
    if (!Array.isArray(data)) return { error: 'Data must be an array for aggregation' };
    const { groupBy, sum, avg, count, min, max } = params;
    if (!groupBy) return { error: 'groupBy is required' };

    const groups = {};
    for (const row of data) {
      const key = row[groupBy];
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    const result = {};
    for (const [key, rows] of Object.entries(groups)) {
      result[key] = { count: rows.length };
      if (sum) result[key].sum = this._round(rows.reduce((a, r) => a + (this._toNumber(r[sum]) || 0), 0));
      if (avg) result[key].avg = this._round(rows.reduce((a, r) => a + (this._toNumber(r[avg]) || 0), 0) / rows.length);
      if (min) result[key].min = this._round(Math.min(...rows.map(r => this._toNumber(r[min])).filter(v => v !== null)));
      if (max) result[key].max = this._round(Math.max(...rows.map(r => this._toNumber(r[max])).filter(v => v !== null)));
    }
    return result;
  }

  _filter(data, params) {
    if (!Array.isArray(data)) return { error: 'Data must be an array for filtering' };
    const { field, operator, value } = params;
    if (!field || !operator) return { error: 'field and operator are required' };

    const ops = {
      '==': (a, b) => a == b,
      '!=': (a, b) => a != b,
      '>': (a, b) => a > b,
      '>=': (a, b) => a >= b,
      '<': (a, b) => a < b,
      '<=': (a, b) => a <= b,
      'contains': (a, b) => String(a).includes(String(b)),
      'startsWith': (a, b) => String(a).startsWith(String(b)),
      'endsWith': (a, b) => String(a).endsWith(String(b)),
      'in': (a, b) => Array.isArray(b) && b.includes(a)
    };

    const op = ops[operator];
    if (!op) return { error: `Unknown operator: ${operator}` };

    const filtered = data.filter(row => op(row[field], value));
    return { filtered, count: filtered.length, originalCount: data.length };
  }

  _transform(data, params) {
    if (!Array.isArray(data)) return { error: 'Data must be an array for transformation' };
    const { map, select, rename, add, remove } = params;

    let result = [...data];

    if (map) {
      result = result.map(row => {
        const newRow = { ...row };
        for (const [key, expr] of Object.entries(map)) {
          try {
            newRow[key] = this._evalExpression(expr, row);
          } catch {
            newRow[key] = null;
          }
        }
        return newRow;
      });
    }

    if (select) {
      result = result.map(row => {
        const newRow = {};
        select.forEach(key => { newRow[key] = row[key]; });
        return newRow;
      });
    }

    if (rename) {
      result = result.map(row => {
        const newRow = { ...row };
        for (const [oldKey, newKey] of Object.entries(rename)) {
          if (newRow[oldKey] !== undefined) {
            newRow[newKey] = newRow[oldKey];
            delete newRow[oldKey];
          }
        }
        return newRow;
      });
    }

    if (add) {
      result = result.map(row => ({ ...row, ...add }));
    }

    if (remove) {
      result = result.map(row => {
        const newRow = { ...row };
        remove.forEach(key => delete newRow[key]);
        return newRow;
      });
    }

    return { transformed: result, count: result.length };
  }

  _evalExpression(expr, row) {
    const replaced = expr.replace(/\{(\w+)\}/g, (match, key) => {
      const val = row[key];
      return typeof val === 'string' ? `"${val}"` : val;
    });
    return Function('"use strict"; return (' + replaced + ')')();
  }

  _visualize(data, params) {
    const { type = 'bar', x, y, group } = params;
    if (!Array.isArray(data)) return { error: 'Data must be an array for visualization' };
    
    const chartData = {
      type,
      data: {
        labels: data.map(d => d[x]),
        datasets: group 
          ? [...new Set(data.map(d => d[group]))].map(g => ({
              label: g,
              data: data.filter(d => d[group] === g).map(d => d[y])
            }))
          : [{ label: y, data: data.map(d => d[y]) }]
      }
    };
    return { chartConfig: chartData };
  }

  _correlate(data, params) {
    const { x, y } = params;
    if (!x || !y || !Array.isArray(data)) return { error: 'x, y fields and array data required' };

    const xVals = data.map(d => this._toNumber(d[x])).filter(v => v !== null);
    const yVals = data.map(d => this._toNumber(d[y])).filter(v => v !== null);
    
    if (xVals.length !== yVals.length || xVals.length < 2) {
      return { error: 'Insufficient paired data' };
    }

    const n = xVals.length;
    const sumX = xVals.reduce((a, b) => a + b, 0);
    const sumY = yVals.reduce((a, b) => a + b, 0);
    const sumXY = xVals.reduce((a, b, i) => a + b * yVals[i], 0);
    const sumX2 = xVals.reduce((a, b) => a + b * b, 0);
    const sumY2 = yVals.reduce((a, b) => a + b * b, 0);

    const r = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return { correlation: this._round(r), n };
  }

  _regression(data, params) {
    const { x, y } = params;
    if (!x || !y || !Array.isArray(data)) return { error: 'x, y fields and array data required' };

    const xVals = data.map(d => this._toNumber(d[x])).filter(v => v !== null);
    const yVals = data.map(d => this._toNumber(d[y])).filter(v => v !== null);
    
    if (xVals.length !== yVals.length || xVals.length < 2) {
      return { error: 'Insufficient paired data' };
    }

    const n = xVals.length;
    const sumX = xVals.reduce((a, b) => a + b, 0);
    const sumY = yVals.reduce((a, b) => a + b, 0);
    const sumXY = xVals.reduce((a, b, i) => a + b * yVals[i], 0);
    const sumX2 = xVals.reduce((a, b) => a + b * b, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { 
      slope: this._round(slope), 
      intercept: this._round(intercept),
      equation: `y = ${this._round(slope)}x + ${this._round(intercept)}`
    };
  }

  _round(val) {
    return Number(val.toFixed(this.config.precision));
  }

  async healthCheck() {
    return { healthy: true };
  }
}

export default DataAnalysisSkill;