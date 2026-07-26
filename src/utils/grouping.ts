/**
 * Category grouping + JS object-literal serialization, shared by the
 * React Native and React/Next.js generators.
 *
 * Tokens are grouped by their first path segment (the "category"), which is
 * camelCased and pluralized: `color.primary` → `colors.primary`. The rest of
 * the path becomes nested camelCase keys. Document order is preserved so
 * output stays deterministic.
 */

import type { ResolvedToken, TokenValue } from "../core/types.js";
import { GeneratorError } from "./errors.js";
import { toCamelCase } from "./naming.js";

/** Category names that read naturally without a trailing "s". */
const UNCOUNTABLE: ReadonlySet<string> = new Set([
  "spacing",
  "typography",
  "sizing",
  "opacity",
  "motion",
  "animation",
  "time",
  "zIndex",
]);

/** Derive the category export name from a token path's first segment. */
export const categoryName = (firstSegment: string): string => {
  const base = toCamelCase([firstSegment]);
  if (base.length === 0) return "tokens";
  if (UNCOUNTABLE.has(base) || base.endsWith("s")) return base;
  return `${base}s`;
};

/** A node in the grouped token tree (insertion-ordered via `Map`). */
export type TokenTreeNode =
  | { readonly kind: "leaf"; readonly token: ResolvedToken }
  | { readonly kind: "group"; readonly children: Map<string, TokenTreeNode> };

/** Result of grouping a resolved token list by category. */
export interface GroupedTokens {
  /** Tokens whose path has a single segment (exported as flat scalars). */
  readonly scalars: readonly ResolvedToken[];
  /** Category export name → nested tree, in first-appearance order. */
  readonly categories: ReadonlyMap<string, TokenTreeNode>;
}

const leafKey = (segment: string): string => {
  const key = toCamelCase([segment]);
  return key.length > 0 ? key : segment;
};

const insertLeaf = (
  root: Extract<TokenTreeNode, { kind: "group" }>,
  token: ResolvedToken,
  rest: readonly string[],
  category: string,
): void => {
  let current = root;
  for (let i = 0; i < rest.length; i++) {
    const key = leafKey(rest[i] as string);
    const isLast = i === rest.length - 1;
    const existing = current.children.get(key);
    if (isLast) {
      if (existing !== undefined) {
        const conflictWith = existing.kind === "leaf" ? existing.token.id : `${token.id} (group)`;
        throw new GeneratorError(
          `Key collision in category "${category}": token "${token.id}" maps to the same ` +
            `key "${key}" as "${conflictWith}". Rename one of the tokens.`,
        );
      }
      current.children.set(key, { kind: "leaf", token });
      return;
    }
    if (existing === undefined) {
      const group: Extract<TokenTreeNode, { kind: "group" }> = {
        kind: "group",
        children: new Map<string, TokenTreeNode>(),
      };
      current.children.set(key, group);
      current = group;
    } else if (existing.kind === "group") {
      current = existing;
    } else {
      throw new GeneratorError(
        `Token "${token.id}" cannot be nested under "${existing.token.id}" in category ` +
          `"${category}" — the latter is a leaf token. Rename one of the tokens.`,
      );
    }
  }
};

/** Group resolved tokens by category (first path segment, pluralized). */
export const groupTokens = (tokens: readonly ResolvedToken[]): GroupedTokens => {
  const scalars: ResolvedToken[] = [];
  const categories = new Map<string, TokenTreeNode>();

  for (const token of tokens) {
    const [first, ...rest] = token.path;
    if (first === undefined || rest.length === 0) {
      scalars.push(token);
      continue;
    }
    const category = categoryName(first);
    let node = categories.get(category);
    if (node === undefined || node.kind !== "group") {
      node = { kind: "group", children: new Map<string, TokenTreeNode>() };
      categories.set(category, node);
    }
    insertLeaf(node, token, rest, category);
  }
  return { scalars, categories };
};

/** Quote an object key only when it is not a valid JS identifier. */
export const jsKey = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);

/** Serialize a leaf token value as a single-line JS literal. */
export const inlineLiteral = (value: TokenValue): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(inlineLiteral).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entry]) => `${jsKey(key)}: ${inlineLiteral(entry as TokenValue)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return "null";
};

/**
 * Serialize a grouped tree as an indented JS object literal (two-space
 * indent, trailing commas). Leaf composites stay on a single line.
 */
export const serializeTokenTree = (node: TokenTreeNode, level = 0): string => {
  if (node.kind === "leaf") return inlineLiteral(node.token.value);
  const pad = "  ".repeat(level);
  const childPad = "  ".repeat(level + 1);
  const lines: string[] = ["{"];
  for (const [key, child] of node.children) {
    lines.push(`${childPad}${jsKey(key)}: ${serializeTokenTree(child, level + 1)},`);
  }
  lines.push(`${pad}}`);
  return lines.join("\n");
};
