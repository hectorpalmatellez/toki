import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken, TokenType } from '../core/types.js';
import { headerComment, themePath } from '../utils/format.js';
import { getNamingFunction } from '../utils/naming.js';
import { expandCompositeToken, formatCssValue, isCompositeType } from './css.js';
import { platformReadme } from './readme.js';

const PATH_NAMESPACE_KEYWORDS: ReadonlySet<string> = new Set([
  'color',
  'spacing',
  'radius',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'letter-spacing',
  'duration',
  'ease',
  'opacity',
  'z-index',
  'breakpoint',
  'shadow',
]);

const TYPE_TO_NAMESPACE: Readonly<Partial<Record<TokenType, string>>> = {
  color: 'color',
  dimension: 'spacing',
  fontWeight: 'font-weight',
  fontFamily: 'font-family',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  duration: 'duration',
  cubicBezier: 'ease',
};

const COMPOSITE_FIELD_TO_NAMESPACE: Readonly<Record<string, string>> = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  width: 'border-width',
  style: 'border-style',
  color: 'color',
  duration: 'duration',
  timingFunction: 'ease',
  delay: 'duration',
};

export const resolveNamespace = (token: ResolvedToken): string | undefined => {
  if (token.type === 'shadow') return undefined;
  if (isCompositeType(token.type)) return undefined;
  const firstSegment = token.path[0];
  if (firstSegment !== undefined && PATH_NAMESPACE_KEYWORDS.has(firstSegment)) {
    return firstSegment;
  }
  return TYPE_TO_NAMESPACE[token.type];
};

const buildVarName = (token: ResolvedToken, namespace: string, namingFn: (path: readonly string[]) => string): string => {
  const firstSegment = token.path[0];
  if (firstSegment === namespace) {
    const remaining = token.path.slice(1);
    if (remaining.length === 0) return `--${namespace}`;
    return `--${namespace}-${namingFn(remaining)}`;
  }
  return `--${namespace}-${namingFn(token.path)}`;
};

const formatTwValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return JSON.stringify(value);
};

export const renderThemeBlock = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];
  const namingFn = getNamingFunction(options.naming ?? 'kebab-case');

  const declarations: string[] = [];
  for (const token of tokens) {
    if (isCompositeType(token.type)) {
      const expanded = expandCompositeToken(token, namingFn);
      for (const decl of expanded) {
        const field = decl.property.split('-').slice(token.path.length).join('-');
        const originalField = Object.keys(token.value as Record<string, unknown>).find((k) => {
          const kebab = k
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .toLowerCase();
          return kebab === field;
        });
        const namespace = originalField !== undefined ? COMPOSITE_FIELD_TO_NAMESPACE[originalField] : undefined;
        if (namespace === undefined) continue;
        const remaining = token.path.slice(1);
        const suffix = remaining.length > 0 ? namingFn(remaining) : '';
        const varName = suffix.length > 0 ? `--${namespace}-${suffix}` : `--${namespace}`;
        const objValue = (token.value as Record<string, unknown>)[originalField ?? ''];
        declarations.push(`  ${varName}: ${formatTwValue(objValue)};`);
      }
      continue;
    }
    const namespace = resolveNamespace(token);
    if (namespace === undefined) continue;
    const value = formatCssValue(token);
    if (value === undefined) continue;
    const varName = buildVarName(token, namespace, namingFn);
    declarations.push(`  ${varName}: ${value};`);
  }

  if (declarations.length === 0) {
    lines.push('@theme {', '}');
  } else {
    lines.push('@theme {', ...declarations, '}');
  }
  lines.push('');

  return lines.join('\n');
};

export const tailwindGenerator: Generator = {
  format: 'tailwind',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('tailwind/tokens.css'),
        format: 'tailwind',
        content: renderThemeBlock(tokens, options),
      },
      {
        relativePath: 'tailwind/README.md',
        format: 'tailwind',
        content: platformReadme('tailwind', options.version),
      },
    ];
  },
};
