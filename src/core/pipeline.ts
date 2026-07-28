/**
 * Pipeline orchestrator: drives Parse → Resolve → Transform → Generate.
 *
 * The writer (disk I/O) is intentionally separate (`writer.ts`) so the
 * pipeline can run entirely in memory — this is what tests do.
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
import { readTokenFile } from './parser.js';
import { resolveDocument } from './resolver.js';
import { transformTokens } from './transformer.js';
import { getGenerator } from '../generators/index.js';
import { TOKI_VERSION } from '../version.js';

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
}

export interface BuildResult {
  readonly artifacts: readonly OutputArtifact[];
  readonly tokenCount: number;
  readonly formats: readonly OutputFormat[];
}

/** Parse + resolve + generate, returning artifacts (no disk I/O). */
export const runPipeline = async (options: BuildOptions): Promise<BuildResult> => {
  const trace = options.verbose
    ? (msg: string): void => {
        console.log(`  ${msg}`);
      }
    : undefined;
  const raw = await readTokenFile(options.input);
  const doc = parseTokenDocument(raw, options.input);
  const tokens = resolveDocument(doc, trace !== undefined ? { trace } : undefined);
  return generate(tokens, {
    formats: options.formats,
    ...(options.theme !== undefined ? { theme: options.theme } : {}),
    ...(options.naming !== undefined ? { naming: options.naming } : {}),
    ...(options.transforms !== undefined ? { transforms: options.transforms } : {}),
  });
};

/** Re-run generation from an already-parsed document (used by tests). */
export const generateFromDocument = (doc: DesignTokenDocument, formats: readonly OutputFormat[]): BuildResult =>
  generate(resolveDocument(doc), { formats });

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

/** Re-run generation from already-resolved tokens. */
export const generate = (tokens: readonly ResolvedToken[], options: GenerateOptions): BuildResult => {
  const perFormat = options.formats.map((format) => {
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
  });
  const artifacts = perFormat.flat();
  const sortedArtifacts = artifacts.toSorted((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return { artifacts: sortedArtifacts, tokenCount: tokens.length, formats: options.formats };
};
