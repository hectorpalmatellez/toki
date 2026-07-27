/**
 * Vue generator: resolved tokens →
 *   - `vue/tokens.css` — `:root` CSS custom properties. Declared globally,
 *     they cascade through Vue's scoped `<style>` blocks, so components
 *     consume them with `var(--color-primary)` without extra setup.
 *   - `vue/tokens.ts` — ES module with `export const camelCase` values.
 *   - `vue/README.md` — platform quick start.
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

export const vueGenerator: Generator = {
  format: 'vue',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('vue/tokens.css'),
        format: 'vue',
        content: renderCssCustomProperties(tokens, options),
      },
      {
        relativePath: t('vue/tokens.ts'),
        format: 'vue',
        content: renderTokensModule(tokens, options),
      },
      {
        relativePath: 'vue/README.md',
        format: 'vue',
        content: platformReadme('vue', options.version),
      },
    ];
  },
};
