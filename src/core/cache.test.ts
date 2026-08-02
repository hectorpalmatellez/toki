import { describe, it, expect } from 'vitest';
import { runPipeline } from './pipeline.js';
import { writeArtifacts } from '../utils/writer.js';
import { parseTokenDocument } from './parser.js';
import { resolveDocument } from './resolver.js';
import {
  CacheStore,
  tier1Key,
  tier2Key,
  serializeResolvedTokens,
  type CacheEntry,
} from './cache.js';
import { sha256 } from '../utils/hashing.js';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const uniqueDir = async (): Promise<string> => {
  const dir = join(tmpdir(), `toki-cache-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

const entry = (key: string, overrides: Partial<CacheEntry> = {}): CacheEntry => ({
  key,
  inputHash: sha256('input'),
  treeHash: sha256('tree'),
  formats: ['css'],
  outputs: ['css/tokens.css'],
  tokenCount: 1,
  timestamp: 1000,
  ...overrides,
});

describe('CacheStore', () => {
  it('round-trips saved entries through the cache file', async () => {
    const dir = await uniqueDir();
    const store = await CacheStore.load(dir);
    await store.save([entry('a'), entry('b')]);
    const reloaded = await CacheStore.load(dir);
    expect(reloaded.lookup('a')).toBeDefined();
    expect(reloaded.lookup('b')).toBeDefined();
    expect(reloaded.lookup('missing')).toBeUndefined();
    const raw = await readFile(join(dir, 'cache.json'), 'utf8');
    const file = JSON.parse(raw) as { version: number; entries: unknown[] };
    expect(file.version).toBe(1);
    expect(file.entries).toHaveLength(2);
  });

  it('merges new entries on subsequent saves', async () => {
    const dir = await uniqueDir();
    const store = await CacheStore.load(dir);
    await store.save([entry('a')]);
    await store.save([entry('b')]);
    const reloaded = await CacheStore.load(dir);
    expect(reloaded.lookup('a')).toBeDefined();
    expect(reloaded.lookup('b')).toBeDefined();
  });

  it('updates existing keys instead of duplicating them', async () => {
    const dir = await uniqueDir();
    const store = await CacheStore.load(dir);
    await store.save([entry('a', { timestamp: 1000 })]);
    await store.save([entry('a', { timestamp: 2000 })]);
    const reloaded = await CacheStore.load(dir);
    expect(reloaded.lookup('a')?.timestamp).toBe(2000);
  });

  it('drops the oldest entries beyond the max-entries cap', async () => {
    const dir = await uniqueDir();
    const store = await CacheStore.load(dir);
    await store.save(
      [entry('oldest', { timestamp: 100 }), entry('middle', { timestamp: 200 }), entry('newest', { timestamp: 300 })],
      2,
    );
    expect(store.lookup('oldest')).toBeUndefined();
    expect(store.lookup('middle')).toBeDefined();
    expect(store.lookup('newest')).toBeDefined();
  });

  it('returns an empty store for a missing cache file', async () => {
    const dir = await uniqueDir();
    const store = await CacheStore.load(dir);
    expect(store.lookup('a')).toBeUndefined();
  });

  it('tolerates a corrupt cache file', async () => {
    const dir = await uniqueDir();
    await writeFile(join(dir, 'cache.json'), 'not json {{{', 'utf8');
    const store = await CacheStore.load(dir);
    expect(store.lookup('a')).toBeUndefined();
  });

  it('tolerates a version-mismatched cache file', async () => {
    const dir = await uniqueDir();
    await writeFile(join(dir, 'cache.json'), JSON.stringify({ version: 99, entries: [entry('a')] }), 'utf8');
    const store = await CacheStore.load(dir);
    expect(store.lookup('a')).toBeUndefined();
  });
});

describe('cache key helpers', () => {
  it('tier-1 and tier-2 keys differ for the same hashes', () => {
    expect(tier1Key('x', 'y')).not.toBe(tier2Key('x', 'y'));
  });

  it('serializeResolvedTokens is deterministic and sensitive to values', () => {
    const doc = parseTokenDocument({
      color: { $type: 'color', primary: { $value: '#1a73e8' }, secondary: { $value: '{color.primary}' } },
    });
    const tokens = resolveDocument(doc);
    expect(serializeResolvedTokens(tokens)).toBe(serializeResolvedTokens(tokens));
    const changed = resolveDocument(
      parseTokenDocument({
        color: { $type: 'color', primary: { $value: '#ff0000' }, secondary: { $value: '{color.primary}' } },
      }),
    );
    expect(serializeResolvedTokens(changed)).not.toBe(serializeResolvedTokens(tokens));
  });
});

describe('pipeline incremental cache', () => {
  const SAMPLE = {
    color: { $type: 'color', primary: { $value: '#1a73e8' }, secondary: { $value: '{color.primary}' } },
    spacing: { $type: 'dimension', small: { $value: '8px' } },
  };

  const build = async (inputPath: string, outputDir: string, cacheDir: string) => {
    const result = await runPipeline({
      input: inputPath,
      formats: ['css'],
      cache: { dir: cacheDir, output: outputDir },
    });
    if (!result.cached) {
      await writeArtifacts(outputDir, result.artifacts, { clean: true });
    }
    return result;
  };

  it('serves the second identical build from cache (tier 1)', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    const first = await build(inputPath, outputDir, cacheDir);
    expect(first.cached).toBe(false);
    expect(first.artifacts.length).toBeGreaterThan(0);

    const second = await build(inputPath, outputDir, cacheDir);
    expect(second.cached).toBe(true);
    expect(second.artifacts).toEqual([]);
    expect(second.tokenCount).toBe(3);
    expect(second.formats).toEqual(['css']);
  });

  it('misses when the input changes', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    await build(inputPath, outputDir, cacheDir);
    await writeFile(
      inputPath,
      JSON.stringify({ color: { $type: 'color', primary: { $value: '#ff0000' } } }),
      'utf8',
    );
    const result = await build(inputPath, outputDir, cacheDir);
    expect(result.cached).toBe(false);
  });

  it('hits tier 2 when different raw bytes resolve to the same tree', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    const inputPathWhitespace = join(inputDir, 'tokens-spaced.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    await writeFile(inputPathWhitespace, JSON.stringify(SAMPLE, null, 4) + '\n', 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    const first = await build(inputPath, outputDir, cacheDir);
    expect(first.cached).toBe(false);

    // Different bytes (whitespace) but identical resolved tree → tier-2 hit.
    const second = await build(inputPathWhitespace, outputDir, cacheDir);
    expect(second.cached).toBe(true);
  });

  it('misses when formats change', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    await build(inputPath, outputDir, cacheDir);
    const result = await runPipeline({
      input: inputPath,
      formats: ['css', 'js'],
      cache: { dir: cacheDir, output: outputDir },
    });
    expect(result.cached).toBe(false);
  });

  it('misses when naming overrides change', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    await build(inputPath, outputDir, cacheDir);
    const result = await runPipeline({
      input: inputPath,
      formats: ['css'],
      naming: { css: 'camelCase' },
      cache: { dir: cacheDir, output: outputDir },
    });
    expect(result.cached).toBe(false);
  });

  it('misses when the theme changes', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    await build(inputPath, outputDir, cacheDir);
    const result = await runPipeline({
      input: inputPath,
      formats: ['css'],
      theme: 'dark',
      cache: { dir: cacheDir, output: outputDir },
    });
    expect(result.cached).toBe(false);
  });

  it('regenerates when cached output files were deleted from disk', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    await build(inputPath, outputDir, cacheDir);
    await rm(join(outputDir, 'css', 'tokens.css'));

    const result = await build(inputPath, outputDir, cacheDir);
    expect(result.cached).toBe(false);
    expect(result.artifacts.length).toBeGreaterThan(0);
  });

  it('reports cached=false when no cache is configured', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const result = await runPipeline({ input: inputPath, formats: ['css'] });
    expect(result.cached).toBe(false);
  });

  it('persists both tier keys to the cache file', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(SAMPLE), 'utf8');
    const outputDir = await uniqueDir();
    const cacheDir = await uniqueDir();

    await build(inputPath, outputDir, cacheDir);
    const raw = await readFile(join(cacheDir, 'cache.json'), 'utf8');
    const file = JSON.parse(raw) as { version: number; entries: CacheEntry[] };
    expect(file.version).toBe(1);
    expect(file.entries).toHaveLength(2);
    expect(file.entries[0]?.outputs).toContain('css/tokens.css');
  });
});
