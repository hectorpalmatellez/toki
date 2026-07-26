/**
 * Angular 11 (legacy) generator: resolved tokens →
 *   - `angular-11/_tokens.scss` — `$kebab-case` SCSS variables.
 *   - `angular-11/tokens.scss`  — entry stylesheet using `@import` only
 *     (no `@use`/`@forward` — Angular 11's Sass pipeline predates the module
 *     system), re-exposing every token as a `:root` CSS custom property.
 *   - `angular-11/tokens.ts`    — `export const CONSTANT_CASE` values.
 *   - `angular-11/README.md`    — platform quick start.
 *
 * No `tokens.module.ts` / `InjectionToken` is generated: Angular 11 DI
 * patterns differ, so consumers import the constants directly.
 */

import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken } from '../core/types.js';
import { headerComment, themePath } from '../utils/format.js';
import { deriveAngularNames, renderScssVariables, renderTokensTs, type AngularNames } from './angular.js';
import { formatCssValue } from './css.js';
import { platformReadme } from './readme.js';

/** Entry stylesheet: `@import` the partial (variables land in scope unprefixed). */
export const renderScssEntryLegacy = (names: readonly AngularNames[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), '', '@import "tokens";', '', ':root {'];
  for (const { token, scss } of names) {
    if (formatCssValue(token) === undefined) continue;
    lines.push(`  --${scss}: #{$${scss}};`);
  }
  lines.push('}', '');
  return lines.join('\n');
};

export const angular11Generator: Generator = {
  format: 'angular-11',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const names = deriveAngularNames(tokens);
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('angular-11/_tokens.scss'),
        format: 'angular-11',
        content: renderScssVariables(names, options),
      },
      {
        relativePath: t('angular-11/tokens.scss'),
        format: 'angular-11',
        content: renderScssEntryLegacy(names, options),
      },
      {
        relativePath: t('angular-11/tokens.ts'),
        format: 'angular-11',
        content: renderTokensTs(names, options),
      },
      {
        relativePath: 'angular-11/README.md',
        format: 'angular-11',
        content: platformReadme('angular-11', options.version),
      },
    ];
  },
};
