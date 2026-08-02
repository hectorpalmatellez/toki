/**
 * Svelte generator: resolved tokens →
 *   - `svelte/tokens.css` — `:root` CSS custom properties. Declared globally,
 *     they cascade through Svelte's scoped `<style>` blocks, so components
 *     consume them with `var(--color-primary)` without extra setup.
 *   - `svelte/tokens.ts` — ES module with `export const camelCase` values.
 *   - `svelte/README.md` — platform quick start.
 */

import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken } from '../core/types.js';
import { GeneratorError } from '../utils/errors.js';
import { headerComment, themePath } from '../utils/format.js';
import { renderCssCustomProperties } from './css.js';
import { formatJsLiteral, makeIdentifier } from './js.js';
import { platformReadme } from './readme.js';

/** `tokens.ts`: ES-module exports for every token using the configured naming convention. */
export const renderTokensModule = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const seen = new Map<string, string>();
  const naming = options.naming ?? 'camelCase';
  const lines: string[] = [headerComment(options.version), ''];
  for (const token of tokens) {
    const identifier = makeIdentifier(token.path, naming);
    const collision = seen.get(identifier);
    if (collision !== undefined) {
      throw new GeneratorError(
        `Identifier collision: tokens "${collision}" and "${token.id}" both map to ` +
          `export name "${identifier}". Rename one of the tokens.`,
      );
    }
    seen.set(identifier, token.id);
    lines.push(`export const ${identifier} = ${formatJsLiteral(token.value)};`);
  }
  lines.push('');
  return lines.join('\n');
};

export const svelteGenerator: Generator = {
  format: 'svelte',
  generate: async (tokens: readonly ResolvedToken[], options: GeneratorOptions): Promise<readonly OutputArtifact[]> => {
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('svelte/tokens.css'),
        format: 'svelte',
        content: renderCssCustomProperties(tokens, options),
      },
      {
        relativePath: t('svelte/tokens.ts'),
        format: 'svelte',
        content: renderTokensModule(tokens, options),
      },
      {
        relativePath: 'svelte/README.md',
        format: 'svelte',
        content: platformReadme('svelte', options.version),
      },
    ];
  },
};
