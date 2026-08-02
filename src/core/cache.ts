/**
 * Incremental build cache: a single versioned JSON file mapping SHA-256 cache
 * keys to build metadata, persisted at `<cacheDir>/cache.json`.
 *
 * Two tiers of keys are stored per build:
 * - Tier 1 (input hash): raw input file bytes → a hit skips parse, resolve,
 *   transform, generate, and write entirely (~0ms rebuilds).
 * - Tier 2 (tree hash): canonical serialization of the resolved token tree →
 *   a hit skips transform, generate, and write (correct even when two raw
 *   inputs resolve to the same tree).
 *
 * Both keys incorporate every output-affecting option (formats, naming,
 * theme, toki version, config-file hash), so output changes always miss.
 *
 * Loads and saves are best-effort: a missing, corrupt, or version-mismatched
 * cache file silently degrades to an empty cache, and save failures never
 * fail the build. Writes are atomic (temp file + rename).
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sha256, canonicalJson } from '../utils/hashing.js';
import type { ResolvedToken } from './types.js';

const CACHE_FILE = 'cache.json';
const CACHE_VERSION = 1;

/** Maximum number of entries kept per cache file (LRU by timestamp). */
export const MAX_CACHE_ENTRIES = 200;

/** A single cache entry: one per tier key for a given build. */
export interface CacheEntry {
  readonly key: string;
  readonly inputHash: string;
  readonly treeHash: string;
  readonly formats: readonly string[];
  /** Relative artifact paths produced by this build (used for existence checks). */
  readonly outputs: readonly string[];
  readonly tokenCount: number;
  readonly timestamp: number;
}

interface CacheFile {
  readonly version: number;
  readonly entries: readonly CacheEntry[];
}

/** Tier-1 cache key: raw input bytes + output-affecting options. */
export const tier1Key = (inputHash: string, optionHash: string): string =>
  sha256(canonicalJson(['input', inputHash, optionHash]));

/** Tier-2 cache key: resolved token tree + output-affecting options. */
export const tier2Key = (treeHash: string, optionHash: string): string =>
  sha256(canonicalJson(['tree', treeHash, optionHash]));

/** Deterministic serialization of resolved tokens (document order, sorted keys). */
export const serializeResolvedTokens = (tokens: readonly ResolvedToken[]): string => {
  const records = tokens.map((token) => {
    const record: Record<string, unknown> = {
      id: token.id,
      path: token.path,
      name: token.name,
      type: token.type,
      value: token.value,
    };
    if (token.description !== undefined) record['description'] = token.description;
    if (token.extensions !== undefined) record['extensions'] = token.extensions;
    return record;
  });
  return canonicalJson(records);
};

/** True when every relative path exists under `outputDir` (cache-hit validation). */
export const allPathsExist = (outputDir: string, relativePaths: readonly string[]): boolean =>
  relativePaths.every((relativePath) => existsSync(join(outputDir, relativePath)));

/** In-memory view of the on-disk cache. All I/O is tolerant of failure. */
export class CacheStore {
  private constructor(
    private readonly entries: Map<string, CacheEntry>,
    private readonly filePath: string,
  ) {}

  /** Load the cache for `cacheDir`, returning an empty store on any problem. */
  static async load(cacheDir: string): Promise<CacheStore> {
    const filePath = join(cacheDir, CACHE_FILE);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return new CacheStore(new Map(), filePath);
      }
      const file = parsed as Partial<CacheFile>;
      if (file['version'] !== CACHE_VERSION || !Array.isArray(file['entries'])) {
        return new CacheStore(new Map(), filePath);
      }
      const entries = new Map<string, CacheEntry>();
      for (const entry of file['entries']) {
        if (entry !== null && typeof entry === 'object' && typeof entry['key'] === 'string') {
          entries.set(entry['key'], entry as CacheEntry);
        }
      }
      return new CacheStore(entries, filePath);
    } catch {
      return new CacheStore(new Map(), filePath);
    }
  }

  /** Look up a cache key. Returns the entry or `undefined` on a miss. */
  lookup(key: string): CacheEntry | undefined {
    return this.entries.get(key);
  }

  /**
   * Merge new entries into the store, prune the oldest entries beyond
   * `maxEntries`, and atomically persist. Failures are swallowed — the cache
   * is best-effort and must never fail a build.
   */
  async save(newEntries: readonly CacheEntry[], maxEntries = MAX_CACHE_ENTRIES): Promise<void> {
    for (const entry of newEntries) {
      this.entries.set(entry.key, entry);
    }
    if (this.entries.size > maxEntries) {
      const oldestFirst = [...this.entries.values()].toSorted((a, b) => a.timestamp - b.timestamp);
      const toDrop = this.entries.size - maxEntries;
      for (const stale of oldestFirst.slice(0, toDrop)) {
        this.entries.delete(stale.key);
      }
    }
    const file: CacheFile = { version: CACHE_VERSION, entries: [...this.entries.values()] };
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(file, null, 2), 'utf8');
      await rename(tmpPath, this.filePath);
    } catch {
      // best-effort persistence
    }
  }
}
