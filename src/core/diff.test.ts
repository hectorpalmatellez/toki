/**
 * Tests for the token diff tool (`src/core/diff.ts`).
 */

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import { diffTokens, runDiff, formatDiffTerminal, formatDiffJson } from './diff.js';
import type { ResolvedToken, TokenValue } from './types.js';

const token = (id: string, value: TokenValue, overrides: Partial<ResolvedToken> = {}): ResolvedToken =>
  Object.freeze({
    path: id.split('.'),
    id,
    name: id.split('.').at(-1) ?? id,
    type: 'color' as const,
    value,
    ...overrides,
  });

const tmp = (name: string): string => join(tmpdir(), `toki-diff-test-${name}.json`);

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

describe('diffTokens', () => {
  it('returns empty result for identical token sets', () => {
    const tokens = new Map([
      ['color.primary', token('color.primary', '#ff0000')],
      ['spacing.small', token('spacing.small', '8px', { type: 'dimension' })],
    ]);
    const result = diffTokens(tokens, tokens);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('detects added tokens', () => {
    const old = new Map<string, ResolvedToken>();
    const updated = new Map([
      ['color.primary', token('color.primary', '#ff0000')],
      ['color.secondary', token('color.secondary', '#00ff00')],
    ]);
    const result = diffTokens(old, updated);
    expect(result.added).toHaveLength(2);
    expect(result.added[0]?.id).toBe('color.primary');
    expect(result.added[1]?.id).toBe('color.secondary');
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('detects removed tokens', () => {
    const old = new Map([
      ['color.primary', token('color.primary', '#ff0000')],
      ['color.secondary', token('color.secondary', '#00ff00')],
    ]);
    const updated = new Map<string, ResolvedToken>();
    const result = diffTokens(old, updated);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(2);
    expect(result.removed[0]?.id).toBe('color.primary');
    expect(result.removed[1]?.id).toBe('color.secondary');
    expect(result.changed).toHaveLength(0);
  });

  it('detects changed tokens', () => {
    const old = new Map([['color.primary', token('color.primary', '#ff0000')]]);
    const updated = new Map([['color.primary', token('color.primary', '#00ff00')]]);
    const result = diffTokens(old, updated);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]?.id).toBe('color.primary');
    expect(result.changed[0]?.oldValue).toBe('#ff0000');
    expect(result.changed[0]?.newValue).toBe('#00ff00');
  });

  it('handles mixed add, remove, and change', () => {
    const old = new Map([
      ['color.primary', token('color.primary', '#ff0000')],
      ['color.secondary', token('color.secondary', '#00ff00')],
    ]);
    const updated = new Map([
      ['color.primary', token('color.primary', '#0000ff')],
      ['color.tertiary', token('color.tertiary', '#ffff00')],
    ]);
    const result = diffTokens(old, updated);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.id).toBe('color.tertiary');
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.id).toBe('color.secondary');
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]?.id).toBe('color.primary');
  });

  it('treats equal objects as unchanged', () => {
    const value = { fontFamily: 'Inter', fontSize: '16px', fontWeight: '400', lineHeight: '1.5' };
    const old = new Map([['typography.body', token('typography.body', value, { type: 'typography' })]]);
    const updated = new Map([['typography.body', token('typography.body', { ...value }, { type: 'typography' })]]);
    const result = diffTokens(old, updated);
    expect(result.changed).toHaveLength(0);
  });

  it('detects changes in composite values', () => {
    const old = new Map([
      ['typography.body', token('typography.body', { fontSize: '16px', fontWeight: '400' }, { type: 'typography' })],
    ]);
    const updated = new Map([
      ['typography.body', token('typography.body', { fontSize: '18px', fontWeight: '400' }, { type: 'typography' })],
    ]);
    const result = diffTokens(old, updated);
    expect(result.changed).toHaveLength(1);
  });

  it('detects changes in array values', () => {
    const old = new Map([['shadow.default', token('shadow.default', [{ x: 0, y: 2 }], { type: 'shadow' })]]);
    const updated = new Map([['shadow.default', token('shadow.default', [{ x: 0, y: 4 }], { type: 'shadow' })]]);
    const result = diffTokens(old, updated);
    expect(result.changed).toHaveLength(1);
  });
});

describe('formatDiffTerminal', () => {
  it('returns no-diff message for empty result', () => {
    const result = diffTokens(new Map(), new Map());
    const output = formatDiffTerminal(result);
    expect(output).toContain('No differences found');
  });

  it('formats added tokens with + prefix', () => {
    const result = diffTokens(new Map(), new Map([['a', token('a', '#fff')]]));
    const output = formatDiffTerminal(result);
    expect(output).toContain('Added (1):');
    expect(output).toContain('+ a');
    expect(output).toContain('#fff');
  });

  it('formats removed tokens with - prefix', () => {
    const result = diffTokens(new Map([['a', token('a', '#fff')]]), new Map());
    const output = formatDiffTerminal(result);
    expect(output).toContain('Removed (1):');
    expect(output).toContain('- a');
  });

  it('formats changed tokens with ~ prefix and arrow', () => {
    const result = diffTokens(new Map([['a', token('a', '#fff')]]), new Map([['a', token('a', '#000')]]));
    const output = formatDiffTerminal(result);
    expect(output).toContain('Changed (1):');
    expect(output).toContain('~ a    #fff → #000');
  });

  it('formats composite values as JSON', () => {
    const result = diffTokens(
      new Map([['t', token('t', { fontSize: '16px' }, { type: 'typography' })]]),
      new Map([['t', token('t', { fontSize: '18px' }, { type: 'typography' })]]),
    );
    const output = formatDiffTerminal(result);
    expect(output).toContain('{"fontSize":"16px"}');
    expect(output).toContain('{"fontSize":"18px"}');
  });
});

describe('formatDiffJson', () => {
  it('returns flat array of diff entries', () => {
    const old = new Map([
      ['a', token('a', '#fff')],
      ['b', token('b', '#000')],
    ]);
    const updated = new Map([
      ['a', token('a', '#ccc')],
      ['c', token('c', '#eee')],
    ]);
    const result = diffTokens(old, updated);
    const json = formatDiffJson(result);
    expect(json).toHaveLength(3);
    const types = json.map((e) => e.type);
    expect(types).toContain('added');
    expect(types).toContain('removed');
    expect(types).toContain('changed');
  });

  it('returns empty array for identical tokens', () => {
    const tokens = new Map([['a', token('a', '#fff')]]);
    const result = diffTokens(tokens, tokens);
    expect(formatDiffJson(result)).toHaveLength(0);
  });
});

describe('runDiff (integration)', () => {
  const cleanup: string[] = [];

  const makeTmp = async (name: string, data: unknown): Promise<string> => {
    const filePath = tmp(name);
    cleanup.push(filePath);
    await writeJson(filePath, data);
    return filePath;
  };

  const cleanupAll = async (): Promise<void> => {
    for (const f of cleanup) {
      await rm(f, { force: true });
    }
    cleanup.length = 0;
  };

  it('diffs two token files on disk', async () => {
    const oldPath = await makeTmp('old', {
      color: { $type: 'color', primary: { $value: '#ff0000' }, secondary: { $value: '#00ff00' } },
    });
    const newPath = await makeTmp('new', {
      color: { $type: 'color', primary: { $value: '#0000ff' }, tertiary: { $value: '#ffff00' } },
    });

    const result = await runDiff(oldPath, newPath);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.id).toBe('color.tertiary');
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.id).toBe('color.secondary');
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]?.id).toBe('color.primary');

    await cleanupAll();
  });

  it('returns empty diff for identical files', async () => {
    const tokens = { color: { $type: 'color', primary: { $value: '#ff0000' } } };
    const oldPath = await makeTmp('identical-old', tokens);
    const newPath = await makeTmp('identical-new', tokens);

    const result = await runDiff(oldPath, newPath);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);

    await cleanupAll();
  });

  it('handles token references across files', async () => {
    const oldPath = await makeTmp('ref-old', {
      color: { $type: 'color', primary: { $value: '#ff0000' }, secondary: { $value: '{color.primary}' } },
    });
    const newPath = await makeTmp('ref-new', {
      color: { $type: 'color', primary: { $value: '#0000ff' }, secondary: { $value: '{color.primary}' } },
    });

    const result = await runDiff(oldPath, newPath);
    // color.primary changed directly; color.secondary is a reference to
    // color.primary, so its resolved value also changes.
    expect(result.changed).toHaveLength(2);
    const ids = result.changed.map((e) => e.id);
    expect(ids).toContain('color.primary');
    expect(ids).toContain('color.secondary');

    await cleanupAll();
  });

  it('handles group $type inheritance in both files', async () => {
    const oldPath = await makeTmp('type-old', {
      color: { $type: 'color', primary: { $value: '#ff0000' } },
    });
    const newPath = await makeTmp('type-new', {
      color: { $type: 'color', primary: { $value: '#ff0000' }, secondary: { $value: '#00ff00' } },
    });

    const result = await runDiff(oldPath, newPath);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.id).toBe('color.secondary');

    await cleanupAll();
  });

  it('throws on invalid JSON file', async () => {
    const badPath = tmp('bad');
    cleanup.push(badPath);
    await writeFile(badPath, 'not json!!!', 'utf8');

    await expect(runDiff(badPath, badPath)).rejects.toThrow();

    await cleanupAll();
  });
});
