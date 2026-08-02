/**
 * Configuration file loader: discovers, loads, and validates `toki.config.ts`
 * (or `.js` / `.mjs`) from the project directory.
 *
 * Config discovery order:
 * 1. `--config <path>` CLI flag (highest priority)
 * 2. `./toki.config.ts`, `./toki.config.js`, `./toki.config.mjs` in CWD
 *
 * Config values are merged with CLI flags — CLI flags take precedence.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import type { OutputFormat, TokiConfig, NamingConvention, TransformPlugin } from './types.js';
import { ALL_FORMATS } from './types.js';
import { ConfigError } from '../utils/errors.js';

const CONFIG_FILENAMES = ['toki.config.ts', 'toki.config.js', 'toki.config.mjs'] as const;

const jiti = createJiti(process.cwd(), { interopDefault: true });

/** Find a config file in the given directory. Returns the absolute path or `undefined`. */
export const discoverConfig = (dir: string): string | undefined => {
  for (const name of CONFIG_FILENAMES) {
    const filePath = resolve(dir, name);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return filePath;
    }
  }
  return undefined;
};

/** Load a config file by absolute path using jiti. */
export const loadConfigFile = (filePath: string): unknown => {
  try {
    return jiti(filePath);
  } catch (error) {
    throw new ConfigError(
      `Failed to load config file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
};

const NAMING_CONVENTIONS: ReadonlySet<string> = new Set<NamingConvention>([
  'camelCase',
  'kebab-case',
  'CONSTANT_CASE',
  'SCREAMING_SNAKE_CASE',
]);

const VALID_FORMATS: ReadonlySet<string> = new Set<string>(ALL_FORMATS);

/** Validate a raw config object against the TokiConfig schema. Throws ConfigError on failure. */
export const validateConfig = (raw: unknown, source?: string): TokiConfig => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError(`Config${source ? ` in "${source}"` : ''} must be a plain object.`);
  }

  const obj = raw as Record<string, unknown>;
  const sourceLabel = source ?? 'config';

  // input (required)
  if (obj['input'] === undefined || obj['input'] === null) {
    throw new ConfigError(`"${sourceLabel}" is missing required field "input".`);
  }
  const input = obj['input'];
  if (typeof input !== 'string' && !Array.isArray(input)) {
    throw new ConfigError(`"${sourceLabel}.input" must be a string or array of strings.`);
  }
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      if (typeof input[i] !== 'string') {
        throw new ConfigError(`"${sourceLabel}.input[${i}]" must be a string.`);
      }
    }
  }

  // output (required)
  if (obj['output'] === undefined || obj['output'] === null) {
    throw new ConfigError(`"${sourceLabel}" is missing required field "output".`);
  }
  if (typeof obj['output'] !== 'string') {
    throw new ConfigError(`"${sourceLabel}.output" must be a string.`);
  }

  // themes (optional)
  if (obj['themes'] !== undefined && obj['themes'] !== null) {
    if (typeof obj['themes'] !== 'object' || Array.isArray(obj['themes'])) {
      throw new ConfigError(`"${sourceLabel}.themes" must be a plain object mapping theme names to file paths.`);
    }
    const themes = obj['themes'] as Record<string, unknown>;
    for (const [key, value] of Object.entries(themes)) {
      if (typeof value !== 'string') {
        throw new ConfigError(`"${sourceLabel}.themes.${key}" must be a file path string.`);
      }
    }
  }

  // formats (optional)
  if (obj['formats'] !== undefined && obj['formats'] !== null) {
    if (!Array.isArray(obj['formats'])) {
      throw new ConfigError(`"${sourceLabel}.formats" must be an array of output format strings.`);
    }
    for (let i = 0; i < obj['formats'].length; i++) {
      const fmt = obj['formats'][i];
      if (typeof fmt !== 'string' || !VALID_FORMATS.has(fmt)) {
        throw new ConfigError(
          `"${sourceLabel}.formats[${i}]" is not a valid format. Supported: ${ALL_FORMATS.join(', ')}.`,
        );
      }
    }
  }

  // naming (optional)
  if (obj['naming'] !== undefined && obj['naming'] !== null) {
    if (typeof obj['naming'] !== 'object' || Array.isArray(obj['naming'])) {
      throw new ConfigError(
        `"${sourceLabel}.naming" must be a plain object mapping format names to naming conventions.`,
      );
    }
    const naming = obj['naming'] as Record<string, unknown>;
    for (const [key, value] of Object.entries(naming)) {
      if (!VALID_FORMATS.has(key)) {
        throw new ConfigError(
          `"${sourceLabel}.naming.${key}" is not a valid format. Supported: ${ALL_FORMATS.join(', ')}.`,
        );
      }
      if (typeof value !== 'string' || !NAMING_CONVENTIONS.has(value)) {
        throw new ConfigError(`"${sourceLabel}.naming.${key}" must be one of: ${[...NAMING_CONVENTIONS].join(', ')}.`);
      }
    }
  }

  // transforms (optional)
  if (obj['transforms'] !== undefined && obj['transforms'] !== null) {
    if (!Array.isArray(obj['transforms'])) {
      throw new ConfigError(`"${sourceLabel}.transforms" must be an array of transform functions.`);
    }
    for (let i = 0; i < obj['transforms'].length; i++) {
      if (typeof obj['transforms'][i] !== 'function') {
        throw new ConfigError(`"${sourceLabel}.transforms[${i}]" must be a function.`);
      }
    }
  }

  // clean (optional)
  if (obj['clean'] !== undefined && obj['clean'] !== null && typeof obj['clean'] !== 'boolean') {
    throw new ConfigError(`"${sourceLabel}.clean" must be a boolean.`);
  }

  // cache (optional)
  if (obj['cache'] !== undefined && obj['cache'] !== null && typeof obj['cache'] !== 'boolean') {
    throw new ConfigError(`"${sourceLabel}.cache" must be a boolean.`);
  }

  // Build result with only defined optional fields to satisfy exactOptionalPropertyTypes.
  // We validate types above, so the casts here are safe.
  const result: TokiConfig = {
    input: obj['input'] as string | readonly string[],
    output: obj['output'] as string,
  } as TokiConfig;

  // Assign optional fields only when present to satisfy exactOptionalPropertyTypes.
  const mutable = result as unknown as Record<string, unknown>;
  if (obj['themes'] !== undefined) mutable['themes'] = obj['themes'];
  if (obj['formats'] !== undefined) mutable['formats'] = obj['formats'];
  if (obj['naming'] !== undefined) mutable['naming'] = obj['naming'];
  if (obj['transforms'] !== undefined) mutable['transforms'] = obj['transforms'];
  if (obj['clean'] !== undefined) mutable['clean'] = obj['clean'];
  if (obj['cache'] !== undefined) mutable['cache'] = obj['cache'];

  return result;
};

/**
 * Load and validate a config file. Returns the validated config, or `undefined`
 * if no config file was found.
 */
export const loadConfig = (configPath?: string): TokiConfig | undefined => {
  const resolved = configPath ?? discoverConfig(process.cwd());
  if (resolved === undefined) return undefined;
  const raw = loadConfigFile(resolved);
  return validateConfig(raw, resolved);
};

/** Resolve the default naming convention for a given output format. */
export const DEFAULT_NAMING: Readonly<Record<OutputFormat, NamingConvention>> = {
  css: 'kebab-case',
  js: 'camelCase',
  'react-native': 'camelCase',
  angular: 'CONSTANT_CASE',
  'angular-11': 'CONSTANT_CASE',
  svelte: 'kebab-case',
  react: 'camelCase',
  stencil: 'camelCase',
  vue: 'kebab-case',
  tailwind: 'kebab-case',
};

/**
 * Merge config file values with CLI flags. CLI flags take precedence.
 * Returns a fully resolved build configuration.
 */
export interface ResolvedBuildConfig {
  readonly input: string;
  readonly output: string;
  readonly formats: readonly OutputFormat[];
  readonly clean: boolean;
  /** Incremental build cache enabled. Defaults to `true`. */
  readonly cache: boolean;
  readonly themes: Readonly<Record<string, string>> | undefined;
  readonly naming: Partial<Record<OutputFormat, NamingConvention>> | undefined;
  readonly transforms: readonly TransformPlugin[];
}

export const mergeConfig = (
  config: TokiConfig | undefined,
  cli: {
    readonly input?: string;
    readonly output?: string;
    readonly format?: readonly string[];
    readonly clean?: boolean;
    readonly cache?: boolean;
  },
): ResolvedBuildConfig => {
  const input = cli.input ?? (typeof config?.input === 'string' ? config.input : config?.input?.[0]);
  if (input === undefined) {
    throw new ConfigError('No input file specified. Provide --input or set "input" in toki.config.ts.');
  }

  const output = cli.output ?? config?.output;
  if (output === undefined) {
    throw new ConfigError('No output directory specified. Provide --output or set "output" in toki.config.ts.');
  }

  const formats: readonly OutputFormat[] =
    cli.format !== undefined && cli.format.length > 0
      ? (cli.format.flatMap((f) => f.split(',').map((s) => s.trim())).filter(Boolean) as OutputFormat[])
      : (config?.formats ?? ['css', 'js']);

  const clean = cli.clean ?? config?.clean ?? true;
  const cache = cli.cache ?? config?.cache ?? true;

  return {
    input,
    output,
    formats,
    clean,
    cache,
    themes: config?.themes,
    naming: config?.naming,
    transforms: config?.transforms ?? [],
  };
};
