/**
 * CSS generator: resolved tokens → `:root { --kebab-case: <value>; }`.
 *
 * Output rules:
 * - One file: `css/tokens.css`.
 * - Carries the standard header comment.
 * - Custom properties named `--<kebab-case-path>` (deterministic, sorted by
 *   document order — the resolver already emits tokens in document order).
 * - Primitive token types (`color`, `dimension`, `fontFamily`, `fontWeight`,
 *   `duration`, `number`, `lineHeight`, `letterSpacing`, `cubicBezier`,
 *   `shadow`) are emitted as CSS values. Multi-property composite types
 *   (`typography`, `border`, `transition`) are deferred to Phase 2 transformer
 *   work and skipped here to keep output valid CSS.
 */

import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken, TokenType, TokenValue } from '../core/types.js';
import { getNamingFunction, toKebabCase } from '../utils/naming.js';
import { headerComment, themePath } from '../utils/format.js';
import { platformReadme } from './readme.js';

/** Returns `true` for multi-property composite types that need expansion. */
export const isCompositeType = (type: TokenType): boolean =>
  type === 'typography' || type === 'border' || type === 'transition';

/** Format a resolved token value as a CSS custom-property value. */
export const formatCssValue = (token: ResolvedToken): string | undefined => {
  const { type, value } = token;
  switch (type) {
    case 'color':
    case 'dimension':
    case 'fontFamily':
    case 'fontWeight':
    case 'duration':
    case 'number':
    case 'lineHeight':
    case 'letterSpacing':
      return formatPrimitive(value);
    case 'cubicBezier':
      return formatCubicBezier(value);
    case 'shadow':
      return formatShadow(value);
    default:
      return undefined;
  }
};

export const formatPrimitive = (value: TokenValue): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return JSON.stringify(sortKeys(value));
};

const formatCubicBezier = (value: TokenValue): string => {
  if (Array.isArray(value) && value.length === 4) {
    return `cubic-bezier(${value.map((n) => String(n)).join(', ')})`;
  }
  return formatPrimitive(value);
};

const formatShadow = (value: TokenValue): string => {
  if (Array.isArray(value)) {
    return value.map(formatSingleShadow).join(', ');
  }
  return formatSingleShadow(value);
};

const formatSingleShadow = (value: TokenValue): string => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    const x = typeof obj['x'] === 'number' ? String(obj['x']) : obj['x'];
    const y = typeof obj['y'] === 'number' ? String(obj['y']) : obj['y'];
    const blur = obj['blur'] !== undefined ? String(obj['blur']) : '0';
    const spread = obj['spread'];
    const color = obj['color'];
    if (x !== undefined) parts.push(String(x));
    if (y !== undefined) parts.push(String(y));
    parts.push(String(blur));
    if (spread !== undefined) parts.push(String(spread));
    if (color !== undefined) parts.push(String(color));
    return parts.join(' ');
  }
  return formatPrimitive(value);
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).toSorted()) out[key] = sortKeys(obj[key]);
    return out;
  }
  return value;
};

/** A single expanded CSS declaration from a composite token. */
export interface CompositeDeclaration {
  readonly property: string;
  readonly value: string;
}

/**
 * Expand a composite token (typography, border, transition) into individual
 * CSS longhand declarations. Returns an empty array for non-object values or
 * unknown composite types.
 */
export const expandCompositeToken = (
  token: ResolvedToken,
  namingFn?: (path: readonly string[]) => string,
): readonly CompositeDeclaration[] => {
  const { type, value, path } = token;
  if (!isCompositeType(type)) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];

  const obj = value as Record<string, unknown>;
  const baseName = namingFn !== undefined ? namingFn(path) : toKebabCase(path);
  const declarations: CompositeDeclaration[] = [];

  const fields = Object.keys(obj).toSorted();
  for (const field of fields) {
    const fieldValue = obj[field];
    if (fieldValue === undefined || fieldValue === null) continue;
    const fieldKebab = field
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
    const formatted =
      typeof fieldValue === 'string'
        ? fieldValue
        : typeof fieldValue === 'number'
          ? Number.isFinite(fieldValue)
            ? String(fieldValue)
            : '0'
          : typeof fieldValue === 'boolean'
            ? fieldValue
              ? '1'
              : '0'
            : JSON.stringify(fieldValue);
    declarations.push({ property: `${baseName}-${fieldKebab}`, value: formatted });
  }

  return declarations;
};

export const cssGenerator: Generator = {
  format: 'css',
  generate: async (_tokens: readonly ResolvedToken[], _options: GeneratorOptions): Promise<readonly OutputArtifact[]> => {
    // Unused parameter names prefixed with `_` to satisfy no-unused-vars.
    const cssPath = _options.theme ? themePath('css/tokens.css', _options.theme) : 'css/tokens.css';
    return [
      {
        relativePath: cssPath,
        format: 'css',
        content: renderCssCustomProperties(_tokens, _options),
      },
      {
        relativePath: 'css/README.md',
        format: 'css',
        content: platformReadme('css', _options.version),
      },
    ];
  },
};

/** Render the `:root { --kebab-case: value; }` stylesheet shared by CSS-based formats. */
export const renderCssCustomProperties = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];
  const namingFn = getNamingFunction(options.naming ?? 'kebab-case');

  const declarations: string[] = [];
  for (const token of tokens) {
    if (isCompositeType(token.type)) {
      const expanded = expandCompositeToken(token, namingFn);
      for (const decl of expanded) {
        declarations.push(`  --${decl.property}: ${decl.value};`);
      }
    } else {
      const value = formatCssValue(token);
      if (value === undefined) continue;
      const name = `--${namingFn(token.path)}`;
      declarations.push(`  ${name}: ${value};`);
    }
  }

  if (declarations.length === 0) {
    // Emit an empty-but-valid `:root` block so the artifact is still valid CSS.
    lines.push(':root {', '}');
  } else {
    lines.push(':root {', ...declarations, '}');
  }
  lines.push('');

  return lines.join('\n');
};
