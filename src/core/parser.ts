/**
 * JSON parser: reads W3C DTCG JSON and produces a normalized {@link TokenTree}
 * plus a flat list of leaf {@link DesignToken}s.
 *
 * The parser:
 * - Reads the JSON file into a plain object (via the standard `node:fs/promises`).
 * - Validates structure: top-level object, reserved `$` keys vs. children,
 *   valid `$type` values, no mixing of `$value` and child nodes, recursive
 *   descent preserving insertion order (JSON key order is preserved by V8).
 * - Builds discriminated `TokenGroupNode` / `DesignToken` nodes with full
 *   path information.
 *
 * `$type` inheritance is *not* applied here — the parser only attaches the
 * explicit `$type` that lives on a node. The {@link Resolver} applies group
 * inheritance during resolution. This keeps parsing deterministic and lets
 * the resolver report inheritance-related errors with full path context.
 */

import { readFile } from 'node:fs/promises';
import type {
  DesignToken,
  DesignTokenDocument,
  ReservedKey,
  TokenComposite,
  TokenGroupNode,
  TokenNode,
  TokenTree,
  TokenType,
  TokenValue,
} from './types.js';
import { RESERVED_KEYS, TOKEN_TYPES } from './types.js';
import { ParseError } from '../utils/errors.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isReservedKey = (key: string): key is ReservedKey => (RESERVED_KEYS as readonly string[]).includes(key);

const isTokenValue = (value: unknown): value is TokenValue => {
  if (value === null) return false;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every(isTokenValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.values(obj).every(isTokenValue);
  }
  return false;
};

/** Read and parse a JSON file from disk into a raw object. */
export const readTokenFile = async (filePath: string): Promise<unknown> => {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (cause) {
    throw new ParseError(`Failed to read token file: ${filePath}`, cause);
  }
  return parseTokenJson(raw, filePath);
};

/** Parse a JSON string into the raw object representation. */
export const parseTokenJson = (raw: string, source?: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch (cause) {
    const where = source !== undefined ? ` from ${source}` : '';
    throw new ParseError(`Invalid JSON${where}: ${(cause as Error).message}`, cause);
  }
};

/**
 * Parse a raw object (already JSON-decoded) into a {@link DesignTokenDocument}.
 */
export const parseTokenDocument = (raw: unknown, source?: string): DesignTokenDocument => {
  if (!isPlainObject(raw)) {
    const where = source !== undefined ? ` in ${source}` : '';
    throw new ParseError(`Top-level token document${where} must be a JSON object.`);
  }
  // The document root is always a group — a bare $value at the top level is
  // not a valid DTCG document.
  if ('$value' in raw) {
    const where = source !== undefined ? ` in ${source}` : '';
    throw new ParseError(`Top-level token document${where} cannot be a single token.`);
  }
  const tokens: DesignToken[] = [];
  const tree = parseGroup(raw, '$root', [], tokens, source);
  return { tree, tokens };
};

const atPath = (path: readonly string[], source?: string): string =>
  source !== undefined ? ` at ${source}:${path.join('.')}` : ` at ${path.join('.')}`;

const parseNode = (
  raw: Record<string, unknown>,
  name: string,
  path: readonly string[],
  tokens: DesignToken[],
  source?: string,
): TokenNode => {
  const keys = Object.keys(raw);
  const childKeys = keys.filter((k) => !isReservedKey(k));
  const hasValue = '$value' in raw;

  // A node that carries `$value` is a *token* (leaf). It must not also have
  // non-reserved children — that would be an ambiguous mixed node.
  if (hasValue) {
    if (childKeys.length > 0) {
      const where = atPath(path, source);
      throw new ParseError(
        `Token${where} carries both "$value" and child keys (${childKeys.join(', ')}). ` +
          'DTCG nodes may be either a token or a group, not both.',
      );
    }
    return parseToken(raw, name, path, tokens);
  }

  // Otherwise, this is a group node. Reserved metadata keys are allowed; all
  // other keys must map to child objects.
  return parseGroup(raw, name, path, tokens, source);
};

const parseToken = (
  raw: Record<string, unknown>,
  name: string,
  path: readonly string[],
  tokens: DesignToken[],
): DesignToken => {
  if (!('$value' in raw)) {
    // Defensive — caller guarantees `$value` is present.
    throw new ParseError(`Token at ${path.join('.')} is missing "$value".`);
  }
  const $value = raw['$value'];
  if (!isTokenValue($value)) {
    throw new ParseError(`Token at ${path.join('.')} has an unsupported $value (function or null).`);
  }
  let $type: TokenType | undefined;
  if ('$type' in raw) {
    const declared = raw['$type'];
    if (typeof declared !== 'string' || !TOKEN_TYPES.has(declared)) {
      throw new ParseError(
        `Token at ${path.join('.')} has an invalid $type ${JSON.stringify(declared)}. ` +
          `Expected one of: ${[...TOKEN_TYPES].join(', ')}.`,
      );
    }
    $type = declared as TokenType;
  }
  let $extensions: TokenComposite | undefined;
  if ('$extensions' in raw) {
    const ext = raw['$extensions'];
    if (!isPlainObject(ext)) {
      throw new ParseError(`Token at ${path.join('.')} has a non-object $extensions.`);
    }
    $extensions = Object.freeze({ ...ext }) as TokenComposite;
  }
  const $description = typeof raw['$description'] === 'string' ? raw['$description'] : undefined;

  const token = Object.freeze({
    kind: 'token' as const,
    id: path.join('.'),
    name,
    path,
    $value,
    ...($type !== undefined && { $type }),
    ...($description !== undefined && { $description }),
    ...($extensions !== undefined && { $extensions }),
  }) as DesignToken;
  tokens.push(token);
  return token;
};

const parseGroup = (
  raw: Record<string, unknown>,
  name: string,
  path: readonly string[],
  tokens: DesignToken[],
  source?: string,
): TokenGroupNode => {
  let $type: TokenType | undefined;
  if ('$type' in raw) {
    const declared = raw['$type'];
    if (typeof declared !== 'string' || !TOKEN_TYPES.has(declared)) {
      const where = atPath(path, source);
      throw new ParseError(
        `Group${where} has an invalid $type ${JSON.stringify(declared)}. ` +
          `Expected one of: ${[...TOKEN_TYPES].join(', ')}.`,
      );
    }
    $type = declared as TokenType;
  }
  let $extensions: TokenComposite | undefined;
  if ('$extensions' in raw) {
    const ext = raw['$extensions'];
    if (!isPlainObject(ext)) {
      const where = atPath(path, source);
      throw new ParseError(`Group${where} has a non-object $extensions.`);
    }
    $extensions = Object.freeze({ ...ext }) as TokenComposite;
  }
  const $description = typeof raw['$description'] === 'string' ? raw['$description'] : undefined;

  const children: Record<string, TokenNode> = {};
  for (const key of Object.keys(raw)) {
    if (isReservedKey(key)) continue;
    const child = raw[key];
    if (!isPlainObject(child)) {
      const where = atPath([...path, key], source);
      throw new ParseError(`Group${where} expected a child object but found ${typeof child}.`);
    }
    children[key] = parseNode(child, key, [...path, key], tokens, source);
  }

  return Object.freeze({
    kind: 'group' as const,
    name,
    path,
    children: Object.freeze(children),
    ...($type !== undefined && { $type }),
    ...($description !== undefined && { $description }),
    ...($extensions !== undefined && { $extensions }),
  }) as TokenGroupNode;
};

/** Parse a raw object directly into a token tree (convenience for tests). */
export const parseTokenTree = (raw: unknown): TokenTree => parseTokenDocument(raw).tree;
