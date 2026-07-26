/**
 * React Native generator: resolved tokens →
 *   - `react-native/tokens.js` — values grouped by category:
 *       `export const colors = { primary: "#1a73e8" };`
 *     Dimension values are raw numbers (dp for layout, sp for font sizes).
 *   - `react-native/styles.js` — `StyleSheet.create()` helper groups derived
 *     from the tokens: `backgrounds` + `textColors` (color tokens) and
 *     `textStyles` (typography tokens).
 *   - `react-native/README.md` — platform quick start.
 *
 * The pipeline's transform stage has already normalized values for RN
 * (dimensions → numbers, fontWeight → canonical strings, shadows → RN shadow
 * objects, typography composites → RN field shapes).
 */

import type { Generator, GeneratorOptions, OutputArtifact, ResolvedToken } from '../core/types.js';
import { headerComment, themePath } from '../utils/format.js';
import { categoryName, groupTokens, inlineLiteral, serializeTokenTree } from '../utils/grouping.js';
import { getNamingFunction } from '../utils/naming.js';
import { makeIdentifier } from './js.js';
import { platformReadme } from './readme.js';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Reference expression into tokens.js for a grouped token: `colors.brand.primary`. */
const categoryReference = (token: ResolvedToken, naming?: 'camelCase'): string | undefined => {
  const [first, ...rest] = token.path;
  if (first === undefined || rest.length === 0) return undefined;
  const category = categoryName(first);
  const namingFn = getNamingFunction(naming ?? 'camelCase');
  // Must mirror the key derivation in grouping.ts (leafKey).
  const keys = rest.map((segment) => {
    const camel = namingFn([segment]);
    const key = camel.length > 0 ? camel : segment;
    // Reserved words are valid property names; digit-leading keys are not.
    return IDENTIFIER.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
  });
  return `${category}${keys.join('')}`;
};

/** Flattened style key for a token below its category: `brand.primary` → `brandPrimary`. */
const styleKey = (token: ResolvedToken): string => makeIdentifier(token.path.slice(1));

interface StyleEntry {
  readonly key: string;
  readonly body: string;
}

const buildStyleGroups = (
  tokens: readonly ResolvedToken[],
  naming?: 'camelCase',
): {
  readonly groups: ReadonlyMap<string, readonly StyleEntry[]>;
  readonly imports: readonly string[];
} => {
  const backgrounds: StyleEntry[] = [];
  const textColors: StyleEntry[] = [];
  const textStyles: StyleEntry[] = [];
  const imports: string[] = [];
  const seenImports = new Set<string>();

  const useImport = (token: ResolvedToken): boolean => {
    const first = token.path[0];
    if (first === undefined || token.path.length < 2) return false;
    const category = categoryName(first);
    if (!seenImports.has(category)) {
      seenImports.add(category);
      imports.push(category);
    }
    return true;
  };

  for (const token of tokens) {
    const ref = categoryReference(token, naming);
    if (ref === undefined) continue; // scalar token — no category to reference
    if (token.type === 'color') {
      if (!useImport(token)) continue;
      backgrounds.push({ key: styleKey(token), body: `{ backgroundColor: ${ref} }` });
      textColors.push({ key: styleKey(token), body: `{ color: ${ref} }` });
    } else if (token.type === 'typography') {
      if (!useImport(token)) continue;
      textStyles.push({ key: styleKey(token), body: ref });
    }
  }

  const groups = new Map<string, readonly StyleEntry[]>();
  if (backgrounds.length > 0) groups.set('backgrounds', backgrounds);
  if (textColors.length > 0) groups.set('textColors', textColors);
  if (textStyles.length > 0) groups.set('textStyles', textStyles);
  return { groups, imports };
};

const renderStyleSheet = (name: string, entries: readonly StyleEntry[]): string => {
  const lines = entries.map((entry) => `  ${entry.key}: ${entry.body},`);
  return `export const ${name} = StyleSheet.create({\n${lines.join('\n')}\n});`;
};

const generateTokensJs = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const { scalars, categories } = groupTokens(tokens);
  const naming = options.naming ?? 'camelCase';
  const lines: string[] = [
    headerComment(options.version),
    '',
    '/**',
    ' * Design tokens grouped by category (first path segment).',
    ' * Dimension values are raw numbers: dp for layout, sp for font sizes.',
    ' */',
  ];

  for (const token of scalars) {
    lines.push('', `export const ${makeIdentifier(token.path, naming)} = ${inlineLiteral(token.value)};`);
  }

  for (const [category, node] of categories) {
    lines.push('', `export const ${category} = ${serializeTokenTree(node)};`);
  }

  lines.push('');
  return lines.join('\n');
};

const generateStylesJs = (tokens: readonly ResolvedToken[], options: GeneratorOptions): string => {
  const naming = options.naming ?? 'camelCase';
  const { groups, imports } = buildStyleGroups(tokens, naming as 'camelCase');
  const lines: string[] = [headerComment(options.version), '', 'import { StyleSheet } from "react-native";'];

  if (imports.length > 0) {
    lines.push(`import { ${imports.join(', ')} } from "./tokens.js";`);
  }

  if (groups.size === 0) {
    lines.push('', 'export const styles = StyleSheet.create({});');
  } else {
    for (const [name, entries] of groups) {
      lines.push('', renderStyleSheet(name, entries));
    }
  }

  lines.push('');
  return lines.join('\n');
};

export const reactNativeGenerator: Generator = {
  format: 'react-native',
  generate: (tokens: readonly ResolvedToken[], options: GeneratorOptions): readonly OutputArtifact[] => {
    const jsPath = options.theme ? themePath('react-native/tokens.js', options.theme) : 'react-native/tokens.js';
    const stylesPath = options.theme ? themePath('react-native/styles.js', options.theme) : 'react-native/styles.js';
    return [
      {
        relativePath: jsPath,
        format: 'react-native',
        content: generateTokensJs(tokens, options),
      },
      {
        relativePath: stylesPath,
        format: 'react-native',
        content: generateStylesJs(tokens, options),
      },
      {
        relativePath: 'react-native/README.md',
        format: 'react-native',
        content: platformReadme('react-native', options.version),
      },
    ];
  },
};
