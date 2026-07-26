/**
 * Pipeline orchestrator: drives Parse → Resolve → Generate.
 *
 * The writer (disk I/O) is intentionally separate (`writer.ts`) so the
 * pipeline can run entirely in memory — this is what tests do.
 */

import type {
  DesignTokenDocument,
  OutputArtifact,
  OutputFormat,
  ResolvedToken,
} from "./types.js";
import { parseTokenDocument } from "./parser.js";
import { readTokenFile } from "./parser.js";
import { resolveDocument } from "./resolver.js";
import { getGenerator } from "../generators/index.js";
import { TOKI_VERSION } from "../version.js";

export interface BuildOptions {
  readonly input: string;
  readonly formats: readonly OutputFormat[];
  readonly verbose?: boolean;
}

export interface BuildResult {
  readonly artifacts: readonly OutputArtifact[];
  readonly tokenCount: number;
  readonly formats: readonly OutputFormat[];
}

/** Parse + resolve + generate, returning artifacts (no disk I/O). */
export const runPipeline = async (options: BuildOptions): Promise<BuildResult> => {
  const raw = await readTokenFile(options.input);
  const doc = parseTokenDocument(raw, options.input);
  const tokens = resolveDocument(doc);
  return generate(tokens, options.formats);
};

/** Re-run generation from an already-parsed document (used by tests). */
export const generateFromDocument = (
  doc: DesignTokenDocument,
  formats: readonly OutputFormat[],
): BuildResult => generate(resolveDocument(doc), formats);

/** Re-run generation from already-resolved tokens. */
export const generate = (
  tokens: readonly ResolvedToken[],
  formats: readonly OutputFormat[],
): BuildResult => {
  const artifacts: OutputArtifact[] = [];
  for (const format of formats) {
    const generator = getGenerator(format);
    artifacts.push(...generator.generate(tokens, { version: TOKI_VERSION }));
  }
  // Deterministic artifact ordering: sort by relativePath so output
  // enumeration (and any future manifest) is byte-stable.
  const sortedArtifacts = artifacts.toSorted((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return { artifacts: sortedArtifacts, tokenCount: tokens.length, formats };
};