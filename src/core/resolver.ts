/**
 * Reference resolver: turns a parsed {@link DesignTokenDocument} into a list
 * of fully-{@link ResolvedToken}s.
 *
 * Responsibilities:
 * - **`$type` inheritance** — a group's `$type` propagates to descendant
 *   tokens unless overridden by a nearer group or the token itself.
 * - **Reference expansion** — `{group.token}` (and embedded references inside
 *   strings / composite values) are replaced with the referenced token's
 *   concrete, already-resolved value.
 * - **Dependency graph + topological sort** — tokens are resolved in
 *   dependency order so each reference maps to a concrete value.
 * - **Circular dependency detection** — any cycle (including self-references)
 *   throws a `CircularReferenceError` naming the tokens in the cycle.
 * - **Missing reference detection** — references to unknown tokens (or to
 *   groups rather than leaf tokens) throw a `MissingReferenceError`.
 *
 * Output order matches document order (the order tokens were collected by the
 * parser, which is JSON insertion order) — this keeps generator output
 * deterministic.
 */

import type {
  DesignToken,
  DesignTokenDocument,
  TokenNode,
  TokenType,
  TokenValue,
  ResolvedToken,
  TokenTree,
} from './types.js';
import { CircularReferenceError, MissingReferenceError, TokenTypeError } from '../utils/errors.js';

/** Options for the resolver, including optional verbose trace output. */
export interface ResolveOptions {
  /** Callback for trace messages during resolution (verbose mode). */
  readonly trace?: (message: string) => void;
}

/** Matches a single reference token `{path.to.token}`. */
const PURE_REF = /^\{([^{}]+)\}$/;
/** Matches all reference occurrences embedded in a string (global). */
const EMBEDDED_REF = /\{([^{}]+)\}/g;

interface Leaf {
  readonly id: string;
  readonly path: readonly string[];
  readonly name: string;
  readonly type: TokenType;
  readonly rawValue: TokenValue;
  readonly description?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

const parseRefId = (ref: string): string => {
  const match = PURE_REF.exec(ref);
  if (match === null) {
    throw new MissingReferenceError(`Malformed reference: ${ref}`);
  }
  return match[1] as string;
};

/** Extract all reference ids referenced inside a raw value (recursively). */
const extractReferences = (value: TokenValue): readonly string[] => {
  const found: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (PURE_REF.test(v)) {
        found.push(parseRefId(v));
        return;
      }
      let match: RegExpExecArray | null;
      EMBEDDED_REF.lastIndex = 0;
      while ((match = EMBEDDED_REF.exec(v)) !== null) {
        found.push(match[1] as string);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v !== null && typeof v === 'object') {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        walk((v as Record<string, unknown>)[k]);
      }
    }
  };
  walk(value);
  return found;
};

/**
 * Walk the token tree and assign each leaf an effective `TokenType` (explicit
 * `$type` overrides the inherited group `$type`). Throws if a token ends up
 * with no resolvable type.
 */
const collectLeaves = (doc: DesignTokenDocument): readonly Leaf[] => {
  const leaves: Leaf[] = [];
  const visit = (node: TokenNode, inheritedType: TokenType | undefined): void => {
    if (node.kind === 'token') {
      const type = resolveTokenType(node, inheritedType);
      leaves.push({
        id: node.path.join('.'),
        path: node.path,
        name: node.name,
        type,
        rawValue: node.$value,
        ...(node.$description !== undefined && { description: node.$description }),
        ...(node.$extensions !== undefined && { extensions: node.$extensions }),
      });
      return;
    }
    const nextInherited = node.$type ?? inheritedType;
    for (const key of Object.keys(node.children)) {
      visit(node.children[key]!, nextInherited);
    }
  };
  visit(doc.tree, undefined);
  return leaves;
};

const resolveTokenType = (token: DesignToken, inherited: TokenType | undefined): TokenType => {
  const type = token.$type ?? inherited;
  if (type === undefined) {
    throw new TokenTypeError(
      `Token "${token.path.join('.')}" has no $type and no group $type to inherit from. ` +
        'Add a $type on the token or an ancestor group.',
    );
  }
  return type;
};

/**
 * Build the dependency graph (token id → referenced token ids), validating
 * every reference points to a known leaf token. Returns a map plus the list
 * of leaf ids in document order.
 */
const buildDependencyGraph = (
  leaves: readonly Leaf[],
): {
  readonly deps: ReadonlyMap<string, readonly string[]>;
  readonly byId: ReadonlyMap<string, Leaf>;
} => {
  const byId = new Map<string, Leaf>();
  for (const leaf of leaves) byId.set(leaf.id, leaf);

  const deps = new Map<string, readonly string[]>();
  for (const leaf of leaves) {
    const refs = extractReferences(leaf.rawValue);
    // Validate every reference resolves to a known leaf token.
    for (const refId of refs) {
      if (!byId.has(refId)) {
        throw new MissingReferenceError(
          `Token "${leaf.id}" references unknown token "{${refId}}". ` +
            'References must point to an existing leaf token by its dotted path.',
        );
      }
    }
    deps.set(leaf.id, refs);
  }
  return { deps, byId };
};

/**
 * Topologically sort leaf ids so that each token appears after the tokens it
 * references. Uses DFS with a coloring scheme (white / gray / black) for
 * cycle detection. On a cycle, throws naming all tokens in the cycle.
 */
const topoSort = (ids: readonly string[], deps: ReadonlyMap<string, readonly string[]>): readonly string[] => {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of ids) color.set(id, WHITE);

  const order: string[] = [];
  const stack: string[] = [];

  const visit = (id: string): void => {
    const state = color.get(id) ?? WHITE;
    if (state === BLACK) return;
    if (state === GRAY) {
      const cycleStart = stack.indexOf(id);
      const cycle = stack.slice(cycleStart).concat(id);
      throw new CircularReferenceError(`Circular reference detected: ${cycle.join(' → ')}`);
    }
    color.set(id, GRAY);
    stack.push(id);
    const refs = deps.get(id) ?? [];
    for (const ref of refs) visit(ref);
    stack.pop();
    color.set(id, BLACK);
    order.push(id);
  };

  for (const id of ids) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }
  return order;
};

/**
 * Substitute references in a raw value with already-resolved values. A pure
 * reference (`"{color.primary}"`) is replaced verbatim with the referenced
 * token's resolved value (preserving native type). Embedded references are
 * string-interpolated.
 */
const substitute = (raw: TokenValue, resolved: ReadonlyMap<string, TokenValue>): TokenValue => {
  if (typeof raw === 'string') {
    if (PURE_REF.test(raw)) {
      const refId = parseRefId(raw);
      const target = resolved.get(refId);
      if (target === undefined) {
        throw new MissingReferenceError(`Unresolved reference {${refId}}.`);
      }
      return target;
    }
    if (raw.includes('{')) {
      return raw.replace(EMBEDDED_REF, (_match, inner: string) => {
        const target = resolved.get(inner);
        if (target === undefined) {
          throw new MissingReferenceError(`Unresolved reference {${inner}}.`);
        }
        return String(target);
      });
    }
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => substitute(item, resolved));
  }
  if (raw !== null && typeof raw === 'object') {
    const out: Record<string, TokenValue> = {};
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      const v = (raw as Record<string, unknown>)[key] as TokenValue;
      out[key] = substitute(v, resolved);
    }
    return out;
  }
  return raw;
};

/**
 * Resolve a parsed {@link DesignTokenDocument} into a flat list of
 * {@link ResolvedToken}s in document order.
 */
export const resolveDocument = (doc: DesignTokenDocument, options?: ResolveOptions): readonly ResolvedToken[] => {
  const trace = options?.trace;
  const leaves = collectLeaves(doc);
  trace?.(`collected ${leaves.length} leaf token${leaves.length === 1 ? '' : 's'}`);
  const { deps, byId } = buildDependencyGraph(leaves);
  const orderedIds = topoSort(
    leaves.map((l) => l.id),
    deps,
  );
  trace?.(`resolved order: ${orderedIds.join(', ')}`);

  const resolvedValues = new Map<string, TokenValue>();
  for (const id of orderedIds) {
    const leaf = byId.get(id)!;
    resolvedValues.set(id, substitute(leaf.rawValue, resolvedValues));
  }

  // Emit in document order for deterministic generator output.
  return leaves.map<ResolvedToken>((leaf) => {
    const value = resolvedValues.get(leaf.id)!;
    if (trace) {
      const display = typeof value === 'string' ? value : JSON.stringify(value);
      trace(`  resolved "${leaf.id}" (${leaf.type}) → ${display}`);
    }
    const resolved: ResolvedToken = Object.freeze({
      path: leaf.path,
      id: leaf.id,
      name: leaf.name,
      type: leaf.type,
      value,
      ...(leaf.description !== undefined && { description: leaf.description }),
      ...(leaf.extensions !== undefined && { extensions: leaf.extensions }),
    }) as ResolvedToken;
    return resolved;
  });
};

/** Parse + resolve convenience helper. */
export const resolveTree = (doc: DesignTokenDocument, options?: ResolveOptions): readonly ResolvedToken[] =>
  resolveDocument(doc, options);

/** Re-export for tests / external use. */
export type { TokenTree };
