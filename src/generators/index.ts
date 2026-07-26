/**
 * Generator registry. Each platform generator is registered here and looked up
 * by its {@link OutputFormat}. The registry is the single source of truth for
 * which formats Toki supports.
 */

import type { Generator, OutputFormat } from "../core/types.js";
import { cssGenerator } from "./css.js";
import { jsGenerator } from "./js.js";
import { reactNativeGenerator } from "./react-native.js";
import { angularGenerator } from "./angular.js";
import { angular11Generator } from "./angular-11.js";
import { svelteGenerator } from "./svelte.js";
import { reactGenerator } from "./react.js";

const REGISTRY: ReadonlyMap<OutputFormat, Generator> = new Map<OutputFormat, Generator>([
  ["css", cssGenerator],
  ["js", jsGenerator],
  ["react-native", reactNativeGenerator],
  ["angular", angularGenerator],
  ["angular-11", angular11Generator],
  ["svelte", svelteGenerator],
  ["react", reactGenerator],
]);

const KNOWN: readonly OutputFormat[] = [...REGISTRY.keys()];

/** Special `--format` value that expands to every implemented format. */
export const ALL_FORMATS_KEYWORD = "all";

/** Look up a generator by format. Throws if the format is not registered. */
export const getGenerator = (format: OutputFormat): Generator => {
  const generator = REGISTRY.get(format);
  if (generator === undefined) {
    throw new Error(`Unknown output format "${format}". Supported formats: ${KNOWN.join(", ")}.`);
  }
  return generator;
};

/** Return the list of formats implemented in this build. */
export const implementedFormats = (): readonly OutputFormat[] => KNOWN;

/**
 * Validate that the requested formats are all implemented. Returns the parsed
 * list of `OutputFormat`s, deduplicated in first-appearance order. The
 * keyword `all` expands to every implemented format. Throws on an unknown
 * format.
 */
export const resolveFormats = (formats: readonly string[]): readonly OutputFormat[] => {
  if (formats.includes(ALL_FORMATS_KEYWORD)) {
    return implementedFormats();
  }
  const parsed: OutputFormat[] = [];
  const seen = new Set<OutputFormat>();
  for (const f of formats) {
    if (!KNOWN.includes(f as OutputFormat)) {
      throw new Error(
        `Unknown output format "${f}". Supported formats: ${KNOWN.join(", ")}, ${ALL_FORMATS_KEYWORD}.`,
      );
    }
    const format = f as OutputFormat;
    if (seen.has(format)) continue;
    seen.add(format);
    parsed.push(format);
  }
  return parsed;
};

/**
 * Parse a raw format string list (comma- or space-separated) into validated
 * `OutputFormat`s. Used by both the CLI and the watch module.
 */
export const parseFormats = (raw: readonly string[]): readonly OutputFormat[] => {
  const flat: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) flat.push(trimmed);
    }
  }
  return resolveFormats(flat);
};
