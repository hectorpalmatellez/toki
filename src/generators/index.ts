/**
 * Generator registry. Each platform generator is registered here and looked up
 * by its {@link OutputFormat}. The registry is the single source of truth for
 * which formats Toki supports.
 */

import type { Generator, OutputFormat } from "../core/types.js";
import { cssGenerator } from "./css.js";
import { jsGenerator } from "./js.js";

const REGISTRY: ReadonlyMap<OutputFormat, Generator> = new Map<OutputFormat, Generator>([
  ["css", cssGenerator],
  ["js", jsGenerator],
]);

const KNOWN: readonly OutputFormat[] = [...REGISTRY.keys()];

/**
 * Look up a generator by format. Throws if the format is not registered.
 *
 * Phase 1 ships `css` and `js`; the remaining formats (`react-native`,
 * `angular`, `angular-11`, `svelte`, `react`) are stubbed in Phase 2.
 */
export const getGenerator = (format: OutputFormat): Generator => {
  const generator = REGISTRY.get(format);
  if (generator === undefined) {
    throw new Error(
      `Unknown output format "${format}". Phase 1 supports: ${KNOWN.join(", ")}.`,
    );
  }
  return generator;
};

/** Return the list of formats implemented in this build. */
export const implementedFormats = (): readonly OutputFormat[] => KNOWN;

/**
 * Validate that the requested formats are all implemented. Returns the parsed
 * list of `OutputFormat`s. Throws on an unknown/unimplemented format.
 */
export const resolveFormats = (formats: readonly string[]): readonly OutputFormat[] => {
  const parsed: OutputFormat[] = [];
  for (const f of formats) {
    if (!KNOWN.includes(f as OutputFormat)) {
      throw new Error(
        `Unknown or unimplemented output format "${f}". Phase 1 supports: ${KNOWN.join(", ")}.`,
      );
    }
    parsed.push(f as OutputFormat);
  }
  return parsed;
};