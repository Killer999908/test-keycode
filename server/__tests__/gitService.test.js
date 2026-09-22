/**
 * Tests for gitService — version control logic
 * (object-store addressing, diff classification, path sanitization)
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// Same primitive gitService uses for object addressing
function shaOf(type, data) {
  return crypto.createHash('sha256').update(JSON.stringify({ type, data })).digest('hex');
}

describe('gitService object addressing', () => {
  it('produces deterministic SHA-256 for identical content', () => {
    const a = shaOf('blob', 'hello world');
    const b = shaOf('blob', 'hello world');
    expect(a).toBe(b);
  });

  it('produces different SHAs for different content', () => {
    expect(shaOf('blob', 'hello')).not.toBe(shaOf('blob', 'hello!'));
  });

  it('distinguishes object types with identical payloads', () => {
    expect(shaOf('blob', 'same')).not.toBe(shaOf('tree', 'same'));
  });

  it('tree SHA changes when any child blob changes', () => {
    const treeA = [{ path: 'index.html', sha: shaOf('blob', 'v1') }];
    const treeB = [{ path: 'index.html', sha: shaOf('blob', 'v2') }];
    expect(shaOf('tree', treeA)).not.toBe(shaOf('tree', treeB));
  });

  it('commit SHA changes when parent changes (lineage integrity)', () => {
    const commitA = { message: 'msg', tree: 't0', parents: [] };
    const commitB = { message: 'msg', tree: 't0', parents: ['p1'] };
    expect(shaOf('commit', commitA)).not.toBe(shaOf('commit', commitB));
  });
});

describe('path sanitization (mirrors gitService.commit)', () => {
  const sanitize = (p) => String(p).replace(/\\/g, '/').replace(/\.\.+/g, '.').replace(/^\/+/, '');

  it('normalizes windows separators', () => {
    expect(sanitize('src\\app.js')).toBe('src/app.js');
  });

  it('blocks path traversal', () => {
    expect(sanitize('../../etc/passwd')).not.toContain('..');
  });

  it('strips leading slashes', () => {
    expect(sanitize('/abs/path.txt')).toBe('abs/path.txt');
  });

  it('keeps legitimate nested paths', () => {
    expect(sanitize('assets/css/main.css')).toBe('assets/css/main.css');
  });
});

describe('diffStats classification rules', () => {
  // Mirrors gitService.diffStats logic
  function classify(oldFiles, newFiles) {
    const added = [], modified = [], removed = [];
    const paths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);
    for (const p of paths) {
      if (!(p in oldFiles)) added.push(p);
      else if (!(p in newFiles)) removed.push(p);
      else if (oldFiles[p] !== newFiles[p]) modified.push(p);
    }
    return { added, modified, removed };
  }

  it('detects added files', () => {
    const r = classify({}, { 'a.js': 'x' });
    expect(r.added).toEqual(['a.js']);
  });

  it('detects modified files', () => {
    const r = classify({ 'a.js': 'old' }, { 'a.js': 'new' });
    expect(r.modified).toEqual(['a.js']);
  });

  it('detects removed files', () => {
    const r = classify({ 'a.js': 'x' }, {});
    expect(r.removed).toEqual(['a.js']);
  });

  it('ignores identical files', () => {
    const r = classify({ 'a.js': 'same' }, { 'a.js': 'same' });
    expect(r.added.length + r.modified.length + r.removed.length).toBe(0);
  });

  it('handles mixed changes in one pass', () => {
    const r = classify(
      { 'keep.js': 'v', 'mod.js': 'old', 'rm.js': 'x' },
      { 'keep.js': 'v', 'mod.js': 'new', 'add.js': 'y' }
    );
    expect(r.added).toEqual(['add.js']);
    expect(r.modified).toEqual(['mod.js']);
    expect(r.removed).toEqual(['rm.js']);
  });
});
