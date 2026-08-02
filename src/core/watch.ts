/**
 * Watch mode: monitors input token files and triggers incremental rebuilds
 * on change. Uses `chokidar` for cross-platform file system watching.
 *
 * Used by the `toki watch` CLI command.
 *
 * Features:
 * - Debounces rapid file changes (200ms default)
 * - Rebuilds all themes on any file change
 * - Prints change summary with timestamp
 * - Handles build errors gracefully without crashing
 * - Cleans up watcher on SIGINT/SIGTERM
 */

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OutputFormat } from './types.js';
import { runPipeline, type BuildCacheOptions } from './pipeline.js';
import { writeArtifacts } from '../utils/writer.js';
import { TokiError } from '../utils/errors.js';
import { loadConfig, mergeConfig, discoverConfig } from './config.js';
import { parseFormats } from '../generators/index.js';
import { sha256 } from '../utils/hashing.js';

export interface WatchOptions {
  readonly input?: string;
  readonly output?: string;
  readonly format: string[];
  readonly clean: boolean;
  readonly cache: boolean;
  readonly verbose: boolean;
  readonly config?: string;
  readonly theme?: string;
}

const DEBOUNCE_MS = 200;

/** Get a timestamp string [HH:MM:SS]. */
const timestamp = (): string => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `[${h}:${m}:${s}]`;
};

/** Resolve build configuration from CLI options and config file. */
const resolveConfig = (options: WatchOptions) => {
  const config = loadConfig(options.config);
  const cliOpts: { input?: string; output?: string; format?: readonly string[]; clean?: boolean } = {};
  if (options.input !== undefined) cliOpts.input = options.input;
  if (options.output !== undefined) cliOpts.output = options.output;
  cliOpts.format = options.format;
  cliOpts.clean = options.clean;
  return mergeConfig(config, cliOpts);
};

/** Execute a single build. Returns the number of artifacts written. */
const executeBuild = async (
  resolved: ReturnType<typeof resolveConfig>,
  formats: readonly OutputFormat[],
  options: WatchOptions,
  cache: BuildCacheOptions | undefined,
): Promise<{ artifacts: number; tokens: number; cached: number }> => {
  const themes = resolved.themes;
  let totalArtifacts = 0;
  let totalTokens = 0;
  let totalCached = 0;

  if (themes !== undefined && Object.keys(themes).length > 0) {
    const themeNames = options.theme ? [options.theme] : Object.keys(themes);
    for (const themeName of themeNames) {
      const tokenFile = themes[themeName];
      if (tokenFile === undefined) {
        throw new TokiError(
          `Unknown theme "${themeName}". Available: ${Object.keys(themes).join(', ')}`,
          'CONFIG_ERROR',
        );
      }
      const result = await runPipeline({
        input: tokenFile,
        formats,
        verbose: false,
        theme: themeName,
        ...(resolved.naming !== undefined ? { naming: resolved.naming } : {}),
        ...(resolved.transforms !== undefined ? { transforms: resolved.transforms } : {}),
        ...(cache !== undefined ? { cache } : {}),
      });
      if (result.cached) {
        totalCached += 1;
        totalTokens += result.tokenCount;
        continue;
      }
      const writeResult = await writeArtifacts(resolved.output, result.artifacts, {
        clean: resolved.clean,
      });
      totalArtifacts += writeResult.written.length;
      totalTokens += result.tokenCount;
    }
  } else {
    const result = await runPipeline({
      input: resolved.input,
      formats,
      verbose: false,
      ...(resolved.naming !== undefined ? { naming: resolved.naming } : {}),
      ...(resolved.transforms !== undefined ? { transforms: resolved.transforms } : {}),
      ...(cache !== undefined ? { cache } : {}),
    });
    if (result.cached) {
      totalCached = 1;
      totalTokens = result.tokenCount;
    } else {
      const writeResult = await writeArtifacts(resolved.output, result.artifacts, {
        clean: resolved.clean,
      });
      totalArtifacts = writeResult.written.length;
      totalTokens = result.tokenCount;
    }
  }

  return { artifacts: totalArtifacts, tokens: totalTokens, cached: totalCached };
};

/** Gather all file paths to watch (input file(s) + config file). */
const getWatchPaths = (resolved: ReturnType<typeof resolveConfig>, configPath?: string): string[] => {
  const paths: string[] = [];
  paths.push(resolved.input);
  if (resolved.themes !== undefined) {
    for (const themeFile of Object.values(resolved.themes)) {
      paths.push(themeFile);
    }
  }
  if (configPath !== undefined) {
    paths.push(configPath);
  }
  return paths;
};

/**
 * Start watching for file changes and rebuilding on change.
 * Returns a cleanup function to stop the watcher.
 */
export const startWatch = async (options: WatchOptions): Promise<() => void> => {
  const resolved = resolveConfig(options);
  const formats = parseFormats(resolved.formats as string[]);
  const watchPaths = getWatchPaths(resolved, options.config);

  // Config file bytes stand in for `transforms` in the cache key.
  const configPath = options.config ?? discoverConfig(process.cwd());
  const configHash = configPath !== undefined ? sha256(readFileSync(configPath, 'utf8')) : undefined;
  const cache: BuildCacheOptions | undefined = options.cache
    ? {
        dir: join(process.cwd(), '.toki'),
        output: resolved.output,
        ...(configHash !== undefined ? { configHash } : {}),
      }
    : undefined;

  if (options.verbose) {
    console.log(`toki watch v${TOKI_VERSION}`);
    console.log(`  watching: ${watchPaths.join(', ')}`);
    console.log(`  formats: ${formats.join(', ')}`);
    console.log(`  output: ${resolved.output}`);
  }

  // Initial build
  const start = performance.now();
  const initial = await executeBuild(resolved, formats, options, cache);
  const elapsed = performance.now() - start;
  if (initial.cached > 0) {
    console.log(`${timestamp()} Initial build: up to date — ${initial.tokens} token${initial.tokens === 1 ? '' : 's'} cached, no changes`);
  } else {
    console.log(
      `${timestamp()} Initial build: ${initial.artifacts} artifact${initial.artifacts === 1 ? '' : 's'}` +
        ` from ${initial.tokens} token${initial.tokens === 1 ? '' : 's'}` +
        ` (${elapsed.toFixed(1)}ms)`,
    );
  }

  // Set up debounced watcher
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let building = false;

  const triggerBuild = (changedPath: string): void => {
    if (building) return;
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      building = true;
      try {
        const buildStart = performance.now();
        const result = await executeBuild(resolved, formats, options, cache);
        const buildElapsed = performance.now() - buildStart;
        if (result.cached > 0) {
          console.log(
            `${timestamp()} Up to date — ${result.tokens} token${result.tokens === 1 ? '' : 's'} cached, no changes` +
              ` (${buildElapsed.toFixed(1)}ms) — ${changedPath}`,
          );
        } else {
          console.log(
            `${timestamp()} Rebuilt ${result.artifacts} artifact${result.artifacts === 1 ? '' : 's'}` +
              ` from ${result.tokens} token${result.tokens === 1 ? '' : 's'}` +
              ` (${buildElapsed.toFixed(1)}ms) — ${changedPath}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${timestamp()} Build failed: ${message}`);
      } finally {
        building = false;
      }
    }, DEBOUNCE_MS);
  };

  const watcher: FSWatcher = chokidarWatch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
  });

  watcher.on('change', (path) => {
    triggerBuild(path);
  });

  watcher.on('add', (path) => {
    triggerBuild(path);
  });

  watcher.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${timestamp()} Watcher error: ${message}`);
  });

  console.log(`${timestamp()} Watching for changes... (press Ctrl+C to stop)`);

  // Handle SIGINT/SIGTERM to cleanly close watcher
  const cleanup = (): void => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    watcher.close();
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  return cleanup;
};

// Re-export version for watch module header
import { TOKI_VERSION } from '../version.js';
