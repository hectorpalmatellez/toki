/**
 * React / Next.js generator: resolved tokens →
 *   - `react/theme.ts` — nested theme object grouped by category
 *     (`{ colors: { primary: "..." }, spacing: { ... } }`), exported
 *     `as const` with a `Theme` type. Compatible with CSS-in-JS providers and
 *     Tailwind's `theme.extend`.
 *   - `react/tokens.css` — companion `:root` custom properties for
 *     `next-themes`-style attribute switching.
 *   - `react/README.md` — platform quick start.
 */

import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken } from '../core/types.js';
import { GeneratorError } from '../utils/errors.js';
import { headerComment, themePath } from '../utils/format.js';
import { categoryName, groupTokens, inlineLiteral, jsKey, serializeTokenTree } from '../utils/grouping.js';
import { renderCssCustomProperties } from './css.js';
import { makeIdentifier } from './js.js';
import { platformReadme } from './readme.js';

/** `theme.ts`: nested category object + `Theme` type + default export. */
export const renderTheme = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const { categories } = groupTokens(tokens);
  const naming = options.naming ?? 'camelCase';

  // Top-level entries in document order: category subtrees and scalar tokens
  // share one namespace, so collisions across the two are detected here.
  const seen = new Map<string, string>();
  const emittedCategories = new Set<string>();
  const entries: { readonly key: string; readonly value: string }[] = [];

  const claim = (key: string, id: string): void => {
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new GeneratorError(
        `Key collision: tokens "${existing}" and "${id}" both map to theme key ` +
          `"${key}". Rename one of the tokens.`,
      );
    }
    seen.set(key, id);
  };

  for (const token of tokens) {
    const [first, ...rest] = token.path;
    if (first === undefined || rest.length === 0) {
      const key = makeIdentifier(token.path, naming);
      claim(key, token.id);
      entries.push({ key, value: inlineLiteral(token.value) });
      continue;
    }
    const category = categoryName(first);
    if (emittedCategories.has(category)) continue;
    emittedCategories.add(category);
    claim(category, token.id);
    const node = categories.get(category);
    if (node === undefined) continue; // unreachable: category came from groupTokens
    entries.push({ key: category, value: serializeTokenTree(node, 1) });
  }

  const lines: string[] = [headerComment(options.version), '', 'export const theme = {'];
  for (const entry of entries) {
    lines.push(`  ${jsKey(entry.key)}: ${entry.value},`);
  }
  lines.push('} as const;', '', 'export type Theme = typeof theme;', '', 'export default theme;', '');
  return lines.join('\n');
};

export const reactGenerator: Generator = {
  format: 'react',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('react/theme.ts'),
        format: 'react',
        content: renderTheme(tokens, options),
      },
      {
        relativePath: t('react/tokens.css'),
        format: 'react',
        content: renderCssCustomProperties(tokens, options),
      },
      {
        relativePath: 'react/README.md',
        format: 'react',
        content: platformReadme('react', options.version),
      },
    ];
  },
};
