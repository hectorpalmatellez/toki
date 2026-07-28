/**
 * Angular (latest) generator: resolved tokens →
 *   - `angular/_tokens.scss`   — `$kebab-case` SCSS variables, `@use`-ready.
 *   - `angular/tokens.scss`    — entry stylesheet that `@use`s the partial and
 *     re-exposes every token as a `:root` CSS custom property.
 *   - `angular/tokens.ts`      — `export const CONSTANT_CASE` values.
 *   - `angular/tokens.module.ts` — `InjectionToken<DesignTokens>` + provider
 *     for Angular dependency injection.
 *   - `angular/README.md`      — platform quick start.
 *
 * Multi-property composites (`typography`, `border`, `transition`) are skipped
 * in SCSS (not representable as a single variable) but present in `tokens.ts`.
 */

import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken } from '../core/types.js';
import { GeneratorError } from '../utils/errors.js';
import { headerComment, themePath } from '../utils/format.js';
import { toKebabCase, getNamingFunction } from '../utils/naming.js';
import { expandCompositeToken, formatCssValue, isCompositeType } from './css.js';
import { formatJsLiteral, inferJsType, makeIdentifier } from './js.js';
import { platformReadme } from './readme.js';

/** One token's names in every Angular namespace. */
export interface AngularNames {
  readonly token: ResolvedToken;
  /** SCSS variable name without the `$` (kebab-case). */
  readonly scss: string;
  /** TypeScript constant name (CONSTANT_CASE). */
  readonly ts: string;
  /** `DesignTokens` interface property (camelCase). */
  readonly prop: string;
}

/** Claim a name in a namespace, throwing `GeneratorError` on collision. */
const claimName = (seen: Map<string, string>, name: string, id: string, kind: string): void => {
  const existing = seen.get(name);
  if (existing !== undefined) {
    throw new GeneratorError(
      `Name collision: tokens "${existing}" and "${id}" both map to ${kind} name ` +
        `"${name}". Rename one of the tokens.`,
    );
  }
  seen.set(name, id);
};

/**
 * Derive collision-free names for all tokens. Throws `GeneratorError` when
 * two paths collapse to the same name in any namespace.
 * @param tsNaming Convention for TypeScript constant names (default: CONSTANT_CASE)
 */
export const deriveAngularNames = (
  tokens: readonly ResolvedToken[],
  tsNaming: 'CONSTANT_CASE' | 'SCREAMING_SNAKE_CASE' = 'CONSTANT_CASE',
): readonly AngularNames[] => {
  const seenScss = new Map<string, string>();
  const seenTs = new Map<string, string>();
  const seenProp = new Map<string, string>();
  const tsNamingFn = getNamingFunction(tsNaming);

  return tokens.map((token) => {
    const scss = toKebabCase(token.path);
    let ts = tsNamingFn(token.path);
    if (ts.length === 0) ts = 'TOKEN';
    if (/^[0-9]/.test(ts)) ts = `_${ts}`;
    const prop = makeIdentifier(token.path);
    claimName(seenScss, scss, token.id, 'SCSS');
    claimName(seenTs, ts, token.id, 'TypeScript');
    claimName(seenProp, prop, token.id, 'DesignTokens');
    return { token, scss, ts, prop };
  });
};

/** Tokens + derived names → `_tokens.scss` content (variables only). */
export const renderScssVariables = (names: readonly AngularNames[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];
  let emitted = 0;
  for (const { token, scss } of names) {
    if (isCompositeType(token.type)) {
      const expanded = expandCompositeToken(token);
      for (const decl of expanded) {
        lines.push(`$${decl.property}: ${decl.value};`);
        emitted += 1;
      }
    } else {
      const value = formatCssValue(token);
      if (value === undefined) continue;
      lines.push(`$${scss}: ${value};`);
      emitted += 1;
    }
  }
  if (emitted === 0) lines.push('// No SCSS-representable tokens in this set.');
  lines.push('');
  return lines.join('\n');
};

/** Entry stylesheet: `@use` the partial and expose CSS custom properties. */
export const renderScssEntry = (names: readonly AngularNames[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), '', '@use "./tokens" as tokens;', '', ':root {'];
  for (const { token, scss } of names) {
    if (isCompositeType(token.type)) {
      const expanded = expandCompositeToken(token);
      for (const decl of expanded) {
        lines.push(`  --${decl.property}: #{tokens.$${decl.property}};`);
      }
    } else if (formatCssValue(token) !== undefined) {
      lines.push(`  --${scss}: #{tokens.$${scss}};`);
    }
  }
  lines.push('}', '');
  return lines.join('\n');
};

/** `tokens.ts`: CONSTANT_CASE exports for every token. */
export const renderTokensTs = (names: readonly AngularNames[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];
  for (const { token, ts } of names) {
    lines.push(`export const ${ts} = ${formatJsLiteral(token.value)};`);
  }
  lines.push('');
  return lines.join('\n');
};

/** `tokens.module.ts`: InjectionToken + value + provider for DI. */
export const renderTokensModule = (names: readonly AngularNames[], options: GeneratorOptions): string => {
  const lines: string[] = [
    headerComment(options.version),
    '',
    'import { InjectionToken } from "@angular/core";',
    '',
    'import * as tokens from "./tokens";',
    '',
    'export interface DesignTokens {',
  ];
  for (const { token, prop } of names) {
    lines.push(`  readonly ${prop}: ${inferJsType(token.value)};`);
  }
  lines.push(
    '}',
    '',
    'export const DESIGN_TOKENS = new InjectionToken<DesignTokens>("DESIGN_TOKENS");',
    '',
    'export const DESIGN_TOKENS_VALUE: DesignTokens = {',
  );
  for (const { ts, prop } of names) {
    lines.push(`  ${prop}: tokens.${ts},`);
  }
  lines.push(
    '};',
    '',
    'export const DESIGN_TOKENS_PROVIDER = {',
    '  provide: DESIGN_TOKENS,',
    '  useValue: DESIGN_TOKENS_VALUE,',
    '};',
    '',
  );
  return lines.join('\n');
};

export const angularGenerator: Generator = {
  format: 'angular',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const tsNaming = options.naming === 'SCREAMING_SNAKE_CASE' ? 'SCREAMING_SNAKE_CASE' : 'CONSTANT_CASE';
    const names = deriveAngularNames(tokens, tsNaming);
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('angular/_tokens.scss'),
        format: 'angular',
        content: renderScssVariables(names, options),
      },
      {
        relativePath: t('angular/tokens.scss'),
        format: 'angular',
        content: renderScssEntry(names, options),
      },
      {
        relativePath: t('angular/tokens.ts'),
        format: 'angular',
        content: renderTokensTs(names, options),
      },
      {
        relativePath: t('angular/tokens.module.ts'),
        format: 'angular',
        content: renderTokensModule(names, options),
      },
      {
        relativePath: 'angular/README.md',
        format: 'angular',
        content: platformReadme('angular', options.version),
      },
    ];
  },
};
