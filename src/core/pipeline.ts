/**
 * Pipeline orchestrator: drives Parse → Resolve → Transform → Generate.
 *
 * The writer (disk I/O) is intentionally separate (`writer.ts`) so the
 * pipeline can run entirely in memory — this is what tests do. The only
 * exceptions are reading the input file (required) and, when a cache
 * directory is configured, best-effort cache reads/writes.
 */

import type {
  DesignTokenDocument,
  NamingConvention,
  OutputArtifact,
  OutputFormat,
  ResolvedToken,
  TransformPlugin,
} from './types.js';
import { parseTokenDocument } from './parser.js';
import { readTokenFileRaw, parseTokenJson } from './parser.js';
import { resolveDocument } from './resolver.js';
import { transformTokens } from './transformer.js';
import { getGenerator } from '../generators/index.js';
import { TOKI_VERSION } from '../version.js';
import { sha256, canonicalJson } from '../utils/hashing.js';
import { CacheStore, tier1Key, tier2Key, serializeResolvedTokens, allPathsExist, type CacheEntry } from './cache.js';

/** Incremental build cache configuration for a pipeline run. */
export interface BuildCacheOptions {
  /** Directory holding the cache file (e.g. `.toki/`). */
  readonly dir: string;
  /** Output directory used by the writer — hits verify artifacts exist here. */
  readonly output: string;
  /** SHA-256 of the config file bytes (proxies for `transforms`), if any. */
  readonly configHash?: string;
}

export interface BuildOptions {
  readonly input: string;
  readonly formats: readonly OutputFormat[];
  readonly verbose?: boolean;
  /** Theme name for single-theme builds (affects output file naming). */
  readonly theme?: string;
  /** Per-format naming convention overrides from config. */
  readonly naming?: Partial<Record<OutputFormat, NamingConvention>>;
  /** Custom transform plugins applied after built-in platform transforms. */
  readonly transforms?: readonly TransformPlugin[];
  /** Incremental build cache. When set, unchanged builds skip generation. */
  readonly cache?: BuildCacheOptions;
}

export interface BuildResult {
  readonly artifacts: readonly OutputArtifact[];
  readonly tokenCount: number;
  readonly formats: readonly OutputFormat[];
  /** True when the run was served from the cache (artifacts are empty). */
  readonly cached: boolean;
}

/** Parse + resolve + generate, returning artifacts (no disk I/O). */
export const runPipeline = async (options: BuildOptions): Promise<BuildResult> => {
  const trace = options.verbose
    ? (msg: string): void => {
        console.log(`  ${msg}`);
      }
    : undefined;
  const raw = await readTokenFileRaw(options.input);
  const inputHash = sha256(raw);
  const cache = options.cache;

  let store: CacheStore | undefined;
  let optionHash: string | undefined;
  let treeHash: string | undefined;

  // Tier 1: identical input bytes + identical options → skip everything.
  if (cache !== undefined) {
    store = await CacheStore.load(cache.dir);
    optionHash = buildOptionHash(options, cache);
    const hit = store.lookup(tier1Key(inputHash, optionHash));
    if (hit !== undefined && allPathsExist(cache.output, hit.outputs)) {
      return cachedResult(hit, options.formats);
    }
  }

  const doc = parseTokenDocument(parseTokenJson(raw, options.input), options.input);
  const tokens = resolveDocument(doc, trace !== undefined ? { trace } : undefined);

  // Tier 2: same resolved tree + same options → skip transform/generate/write.
  if (cache !== undefined && store !== undefined && optionHash !== undefined) {
    treeHash = sha256(serializeResolvedTokens(tokens));
    const hit = store.lookup(tier2Key(treeHash, optionHash));
    if (hit !== undefined && allPathsExist(cache.output, hit.outputs)) {
      return cachedResult(hit, options.formats);
    }
  }

  const result = await generate(tokens, {
    formats: options.formats,
    ...(options.theme !== undefined ? { theme: options.theme } : {}),
    ...(options.naming !== undefined ? { naming: options.naming } : {}),
    ...(options.transforms !== undefined ? { transforms: options.transforms } : {}),
  });

  // Miss → persist both tier keys so the next run (and any run producing the
  // same tree from different raw bytes) can hit.
  if (cache !== undefined && store !== undefined && optionHash !== undefined && treeHash !== undefined) {
    const common = {
      inputHash,
      treeHash,
      formats: [...options.formats].toSorted(),
      outputs: result.artifacts.map((artifact) => artifact.relativePath).toSorted(),
      tokenCount: result.tokenCount,
      timestamp: Date.now(),
    };
    await store.save([
      { ...common, key: tier1Key(inputHash, optionHash) },
      { ...common, key: tier2Key(treeHash, optionHash) },
    ]);
  }

  return { artifacts: result.artifacts, tokenCount: result.tokenCount, formats: result.formats, cached: false };
};

/** A cache hit: no artifacts produced, metadata from the stored entry. */
const cachedResult = (entry: CacheEntry, formats: readonly OutputFormat[]): BuildResult => ({
  artifacts: [],
  tokenCount: entry.tokenCount,
  formats,
  cached: true,
});

/**
 * Hash of every option that affects generated output. `transforms` cannot be
 * serialized, so the config file hash stands in for them — editing the config
 * invalidates the cache, which is the safe direction.
 */
const buildOptionHash = (options: BuildOptions, cache: BuildCacheOptions): string => {
  const naming = Object.entries(options.naming ?? {})
    .map(([format, convention]) => [format, convention] as const)
    .toSorted((a, b) => a[0].localeCompare(b[0]));
  const payload: Record<string, unknown> = {
    formats: [...options.formats].toSorted(),
    naming,
    version: TOKI_VERSION,
  };
  if (options.theme !== undefined) payload['theme'] = options.theme;
  if (cache.configHash !== undefined) payload['configHash'] = cache.configHash;
  return sha256(canonicalJson(payload));
};

/** Re-run generation from an already-parsed document (used by tests). */
export const generateFromDocument = async (
  doc: DesignTokenDocument,
  formats: readonly OutputFormat[],
): Promise<BuildResult> => generate(resolveDocument(doc), { formats });

/** Apply custom transform plugins after built-in platform transforms. */
const applyCustomTransforms = (
  tokens: readonly ResolvedToken[],
  plugins: readonly TransformPlugin[],
  platform: OutputFormat,
): readonly ResolvedToken[] => {
  if (plugins.length === 0) return tokens;
  let result = tokens;
  for (const plugin of plugins) {
    result = result.map((token) => plugin(token, { platform }));
  }
  return result;
};

/** Options for the in-memory generate function. */
export interface GenerateOptions {
  readonly formats: readonly OutputFormat[];
  readonly theme?: string;
  readonly naming?: Partial<Record<OutputFormat, NamingConvention>>;
  readonly transforms?: readonly TransformPlugin[];
}

/**
 * Re-run generation from already-resolved tokens.
 *
 * Each selected format's Transform → Generate work runs concurrently via
 * `Promise.all`; artifact order is normalized by sorting on `relativePath`
 * so output stays deterministic regardless of completion order.
 */
export const generate = async (tokens: readonly ResolvedToken[], options: GenerateOptions): Promise<BuildResult> => {
  const perFormat = await Promise.all(
    options.formats.map(async (format) => {
      const generator = getGenerator(format);
      let transformed = transformTokens(tokens, format);
      transformed = applyCustomTransforms(transformed, options.transforms ?? [], format);
      const naming = options.naming?.[format];
      const generatorOptions = {
        version: TOKI_VERSION,
        ...(options.theme !== undefined ? { theme: options.theme } : {}),
        ...(naming !== undefined ? { naming } : {}),
      };
      return generator.generate(transformed, generatorOptions);
    }),
  );
  const artifacts = perFormat.flat();
  const sortedArtifacts = artifacts.toSorted((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return { artifacts: sortedArtifacts, tokenCount: tokens.length, formats: options.formats, cached: false };
};
