/**
 * StencilJS generator: resolved tokens →
 *   - `stencil/tokens.css` — `:root` CSS custom properties (same output as CSS
 *     generator). Stencil components consume tokens natively as CSS variables.
 *   - `stencil/tokens.ts` — ES module with typed constant exports (camelCase)
 *     + a grouped `tokens` object keyed by category (pluralized).
 *   - `stencil/tokens.d.ts` — companion type declarations for `tokens.ts`.
 *   - `stencil/types.ts` — per-category union types (`ColorToken`,
 *     `SpacingToken`, …) and a full `TokenName` union so Stencil `@Prop()`
 *     decorators can accept typed token-name strings.
 *   - `stencil/README.md` — platform quick start.
 */

import type {
  Generator,
  GeneratorOptions,
  NamingConvention,
  OutputArtifact,
  ResolvedToken,
} from '../core/types.js';
import { GeneratorError } from '../utils/errors.js';
import { headerComment, themePath } from '../utils/format.js';
import { jsKey, serializeTokenTree } from '../utils/grouping.js';
import type { TokenTreeNode } from '../utils/grouping.js';
import { toCamelCase, toPascalCase } from '../utils/naming.js';
import { renderCssCustomProperties } from './css.js';
import { formatJsLiteral, inferJsType, makeIdentifier } from './js.js';
import { platformReadme } from './readme.js';

// ---------------------------------------------------------------------------
// tokens.ts
// ---------------------------------------------------------------------------

const leafKey = (segment: string): string => {
  const key = toCamelCase([segment]);
  return key.length > 0 ? key : segment;
};

const insertLeaf = (
  categories: Map<string, TokenTreeNode>,
  token: ResolvedToken,
  rest: readonly string[],
  category: string,
): void => {
  let root = categories.get(category);
  if (root === undefined || root.kind !== 'group') {
    root = { kind: 'group', children: new Map<string, TokenTreeNode>() };
    categories.set(category, root);
  }
  let current = root;
  for (let i = 0; i < rest.length; i++) {
    const key = leafKey(rest[i]!);
    const isLast = i === rest.length - 1;
    const existing = current.children.get(key);
    if (isLast) {
      if (existing !== undefined) {
        const conflictWith = existing.kind === 'leaf' ? existing.token.id : `${token.id} (group)`;
        throw new GeneratorError(
          `Key collision in category "${category}": token "${token.id}" maps to the same ` +
            `key "${key}" as "${conflictWith}". Rename one of the tokens.`,
        );
      }
      current.children.set(key, { kind: 'leaf', token });
      return;
    }
    if (existing === undefined) {
      const group: Extract<TokenTreeNode, { kind: 'group' }> = {
        kind: 'group',
        children: new Map<string, TokenTreeNode>(),
      };
      current.children.set(key, group);
      current = group;
    } else if (existing.kind === 'group') {
      current = existing;
    } else {
      throw new GeneratorError(
        `Token "${token.id}" cannot be nested under "${existing.token.id}" in category ` +
          `"${category}" — the latter is a leaf token. Rename one of the tokens.`,
      );
    }
  }
};

/** Render `tokens.ts`: individual camelCase exports + grouped `tokens` object. */
export const renderTokensModule = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];
  const naming: NamingConvention = options.naming ?? 'camelCase';

  // Individual camelCase exports with collision detection
  const seen = new Map<string, string>();
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

  // Grouped `tokens` object keyed by raw first path segment (not pluralized)
  const categories = new Map<string, TokenTreeNode>();
  for (const token of tokens) {
    const [first, ...rest] = token.path;
    if (first === undefined || rest.length === 0) continue;
    insertLeaf(categories, token, rest, first);
  }

  const entries: string[] = [];
  for (const [cat, node] of categories) {
    entries.push(`  ${jsKey(cat)}: ${serializeTokenTree(node, 1)},`);
  }

  lines.push('export const tokens = {');
  lines.push(...entries);
  lines.push('} as const;');
  lines.push('');
  lines.push('export type TokenCategory = keyof typeof tokens;');
  lines.push('');

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// tokens.d.ts
// ---------------------------------------------------------------------------

/** Render `tokens.d.ts`: companion type declarations. */
export const renderTypesDeclarations = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];
  const naming: NamingConvention = options.naming ?? 'camelCase';

  for (const token of tokens) {
    const identifier = makeIdentifier(token.path, naming);
    lines.push(`export declare const ${identifier}: ${inferJsType(token.value)};`);
  }

  lines.push('');
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// types.ts
// ---------------------------------------------------------------------------

/** Render `types.ts`: per-category union types + full `TokenName` union. */
export const renderUnionTypes = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const lines: string[] = [headerComment(options.version), ''];

  // Group token IDs by first path segment
  const typeGroups = new Map<string, string[]>();
  for (const token of tokens) {
    const category = token.path[0];
    if (category === undefined) continue;
    const list = typeGroups.get(category) ?? [];
    list.push(token.id);
    typeGroups.set(category, list);
  }

  const allTypeNames: string[] = [];

  for (const [cat, ids] of typeGroups) {
    const typeName = `${toPascalCase([cat])}Token`;
    allTypeNames.push(typeName);

    lines.push(`export type ${typeName} =`);
    for (let i = 0; i < ids.length; i++) {
      const isLast = i === ids.length - 1;
      const prefix = isLast ? '  ' : '  |';
      lines.push(`${prefix} ${JSON.stringify(ids[i]!)}${isLast ? ';' : ''}`);
    }
    lines.push('');
  }

  // Full TokenName union
  if (allTypeNames.length > 0) {
    lines.push('export type TokenName =');
    for (let i = 0; i < allTypeNames.length; i++) {
      const isLast = i === allTypeNames.length - 1;
      const prefix = isLast ? '  ' : '  |';
      lines.push(`${prefix} ${allTypeNames[i]}${isLast ? ';' : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export const stencilGenerator: Generator = {
  format: 'stencil',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const t = (p: string) => (options.theme ? themePath(p, options.theme) : p);
    return [
      {
        relativePath: t('stencil/tokens.css'),
        format: 'stencil',
        content: renderCssCustomProperties(tokens, options),
      },
      {
        relativePath: t('stencil/tokens.ts'),
        format: 'stencil',
        content: renderTokensModule(tokens, options),
      },
      {
        relativePath: t('stencil/tokens.d.ts'),
        format: 'stencil',
        content: renderTypesDeclarations(tokens, options),
      },
      {
        relativePath: t('stencil/types.ts'),
        format: 'stencil',
        content: renderUnionTypes(tokens, options),
      },
      {
        relativePath: 'stencil/README.md',
        format: 'stencil',
        content: platformReadme('stencil', options.version),
      },
    ];
  },
};
