/**
 * Figma Tokens Studio importer: reads Figma Tokens Studio export format
 * and converts to W3C DTCG format.
 *
 * Usage: `toki import --from figma-tokens --input figma-tokens.json`
 *
 * Figma Tokens Studio export format:
 * ```json
 * {
 *   "global": {
 *     "color": {
 *       "primary": {
 *         "value": "#1a73e8",
 *         "type": "color",
 *         "description": "Primary brand color"
 *       }
 *     }
 *   },
 *   "$metadata": { "tokenSetOrder": ["global"] },
 *   "$themes": [{ "id": "light", "selectedTokenSets": { "global": "enabled" } }]
 * }
 * ```
 *
 * Conversion rules:
 * - `value` → `$value`
 * - `type` → `$type`
 * - `description` → `$description` (already matches DTCG naming)
 * - Top-level keys (e.g. `"global"`) are theme selectors — stripped
 * - `$metadata` and `$themes` are stripped
 * - Nested group structure is preserved
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { TOKEN_TYPES } from '../core/types.js';
import type { TokenType } from '../core/types.js';
import { ImportError } from '../utils/errors.js';

/** Figma Tokens Studio token shape. */
interface FigmaToken {
  readonly value?: unknown;
  readonly type?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

/** Figma Tokens Studio node — either a token or a group. */
type FigmaNode = FigmaToken | Record<string, unknown>;

const META_KEYS = new Set(['$metadata', '$themes']);

const isFigmaToken = (node: FigmaNode): boolean => {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return false;
  return 'value' in node;
};

const isValidType = (type: string): type is TokenType => TOKEN_TYPES.has(type);

/**
 * Convert a Figma Tokens Studio node to W3C DTCG format recursively.
 */
const convertNode = (node: FigmaNode, path: readonly string[]): Record<string, unknown> => {
  if (isFigmaToken(node)) {
    return convertToken(node, path);
  }
  return convertGroup(node, path);
};

/**
 * Convert a single Figma Tokens Studio token to DTCG format.
 */
const convertToken = (node: FigmaToken, path: readonly string[]): Record<string, unknown> => {
  if (node.value === undefined) {
    throw new ImportError(`Token at "${path.join('.')}" is missing a "value" property.`);
  }

  const result: Record<string, unknown> = {
    $value: node.value,
  };

  // Validate and map type
  if (node.type !== undefined) {
    if (typeof node.type !== 'string') {
      throw new ImportError(`Token at "${path.join('.')}" has an invalid "type" property (expected a string).`);
    }
    if (!isValidType(node.type)) {
      throw new ImportError(
        `Token at "${path.join('.')}" has an unknown type "${node.type}". ` +
          `Supported types: ${[...TOKEN_TYPES].join(', ')}.`,
      );
    }
    result['$type'] = node.type as TokenType;
  }

  // Figma TS uses "description" (matches DTCG $description)
  if (typeof node.description === 'string') {
    result['$description'] = node.description;
  }

  return result;
};

/**
 * Convert a Figma Tokens Studio group to DTCG format recursively.
 */
const convertGroup = (node: FigmaNode, path: readonly string[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  // Group-level $type: Figma TS uses "type", DTCG uses "$type"
  const groupType = node.type ?? node['$type'];
  if (groupType !== undefined) {
    if (typeof groupType !== 'string') {
      throw new ImportError(`Group at "${path.join('.')}" has an invalid "type" property.`);
    }
    if (!isValidType(groupType)) {
      throw new ImportError(`Group at "${path.join('.')}" has an unknown type "${groupType}".`);
    }
    result['$type'] = groupType as TokenType;
  }

  // Group-level description
  if (typeof node.description === 'string') {
    result['$description'] = node.description;
  }

  // Convert children
  const reserved = new Set(['value', 'type', 'description', '$type', '$description']);
  for (const [key, child] of Object.entries(node)) {
    if (reserved.has(key)) continue;
    if (child === null || typeof child !== 'object' || Array.isArray(child)) {
      throw new ImportError(`Group at "${path.join('.')}" has a non-object child "${key}".`);
    }
    result[key] = convertNode(child as FigmaNode, [...path, key]);
  }

  return result;
};

/**
 * Convert a Figma Tokens Studio JSON object to W3C DTCG format.
 * Strips $metadata and $themes, then converts the first remaining
 * top-level key (theme group) to DTCG.
 *
 * If the input has multiple top-level theme groups, all are merged
 * under a single DTCG root (last-write-wins for conflicts).
 */
export const convertFigmaTokens = (input: unknown): Record<string, unknown> => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ImportError('Figma Tokens Studio input must be a JSON object.');
  }

  const obj = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Find theme groups (skip $metadata, $themes)
  for (const [key, value] of Object.entries(obj)) {
    if (META_KEYS.has(key)) continue;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ImportError(`Top-level key "${key}" must be a JSON object (a token set).`);
    }

    // This is a theme group — convert its contents
    const groupResult = convertGroup(value as FigmaNode, [key]);
    // Merge into result (all theme groups are merged into one root)
    Object.assign(result, groupResult);
  }

  if (Object.keys(result).length === 0) {
    throw new ImportError(
      'No token sets found in the Figma Tokens Studio file. ' +
        'Ensure the file contains at least one token set (excluding $metadata and $themes).',
    );
  }

  return result;
};

/**
 * Import a Figma Tokens Studio file, convert to DTCG, and write to disk.
 */
export const importFigmaTokens = async (options: {
  readonly input: string;
  readonly output?: string;
}): Promise<string> => {
  const inputPath = resolve(options.input);

  let raw: string;
  try {
    raw = await readFile(inputPath, 'utf8');
  } catch (cause) {
    throw new ImportError(`Failed to read file: ${inputPath}`, cause);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new ImportError(
      `Invalid JSON in ${inputPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  }

  const dtcg = convertFigmaTokens(parsed);

  const outputPath = resolve(options.output ?? dirname(inputPath), 'tokens.json');

  try {
    await writeFile(outputPath, JSON.stringify(dtcg, null, 2) + '\n', 'utf8');
  } catch (cause) {
    throw new ImportError(`Failed to write output: ${outputPath}`, cause);
  }

  return outputPath;
};
