/**
 * Name-case conversion helpers used by generators to map token paths to
 * platform-idiomatic identifiers.
 *
 * Each helper accepts a token path (e.g. `["color", "primary", "500"]`) and
 * returns a single identifier in the target case.
 */

import type { NamingConvention } from '../core/types.js';

const isWordBoundary = (ch: string): boolean => ch === '-' || ch === '_' || ch === '.' || ch === ' ';

const splitWords = (input: string): readonly string[] => {
  // Split on `-`, `_`, `.`, and spaces, and on camelCase / PascalCase boundaries.
  const rough = input.split(/[-_.\s]+/u).filter(Boolean);
  const words: string[] = [];
  for (const part of rough) {
    // Split on lowercase→uppercase transitions (camelCase/PascalCase).
    const sub = part
      .replace(/([a-z0-9])([A-Z])/g, '$1\0$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1\0$2')
      .split('\0');
    for (const w of sub) {
      if (w.length > 0) words.push(w);
    }
  }
  // Fallback: if no word boundaries were detected, treat the whole input as one word.
  if (words.length === 0 && input.length > 0) {
    if (isWordBoundary(input[0]!)) {
      // Defensive: pure-separator input → no words.
      return [];
    }
    return [input];
  }
  return words;
};

/** Convert a token path to `camelCase`. */
export const toCamelCase = (path: readonly string[]): string => {
  const words = path.flatMap((segment) => splitWords(segment) as string[]);
  if (words.length === 0) return '';
  return words
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
};

/** Convert a token path to `kebab-case`. */
export const toKebabCase = (path: readonly string[]): string =>
  path
    .flatMap((segment) => splitWords(segment) as string[])
    .map((word) => word.toLowerCase())
    .join('-');

/** Convert a token path to `CONSTANT_CASE` (SCREAMING_SNAKE_CASE). */
export const toConstantCase = (path: readonly string[]): string =>
  path
    .flatMap((segment) => splitWords(segment) as string[])
    .map((word) => word.toUpperCase())
    .join('_');

/** Convert a token path to `PascalCase`. */
export const toPascalCase = (path: readonly string[]): string =>
  path
    .flatMap((segment) => splitWords(segment) as string[])
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join('');

/** SCREAMING_SNAKE_CASE is an alias for CONSTANT_CASE (identical output). */
export const toScreamingSnakeCase = toConstantCase;

/** Map a naming convention string to its corresponding conversion function. */
export const getNamingFunction = (convention: NamingConvention): ((path: readonly string[]) => string) => {
  switch (convention) {
    case 'camelCase':
      return toCamelCase;
    case 'kebab-case':
      return toKebabCase;
    case 'CONSTANT_CASE':
      return toConstantCase;
    case 'SCREAMING_SNAKE_CASE':
      return toScreamingSnakeCase;
  }
};
