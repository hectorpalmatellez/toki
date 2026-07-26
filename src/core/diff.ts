/**
 * Token diff tool: compares two W3C DTCG token files and reports added,
 * removed, and changed tokens with before/after values.
 *
 * Used by the `toki diff <old> <new>` CLI command.
 *
 * Output format:
 * - Human-readable terminal output (default)
 * - JSON array with `--json` flag
 */

import type { ResolvedToken, TokenValue } from "./types.js";
import { readTokenFile } from "./parser.js";
import { parseTokenDocument } from "./parser.js";
import { resolveDocument } from "./resolver.js";

export type DiffEntryType = "added" | "removed" | "changed";

export interface DiffEntry {
  readonly type: DiffEntryType;
  readonly id: string;
  readonly path: readonly string[];
  readonly oldValue?: TokenValue;
  readonly newValue?: TokenValue;
  readonly description?: string;
}

export interface DiffResult {
  readonly added: readonly DiffEntry[];
  readonly removed: readonly DiffEntry[];
  readonly changed: readonly DiffEntry[];
}

/** Parse a token file and return resolved tokens indexed by dotted id. */
const resolveTokens = async (filePath: string): Promise<ReadonlyMap<string, ResolvedToken>> => {
  const raw = await readTokenFile(filePath);
  const doc = parseTokenDocument(raw, filePath);
  const tokens = resolveDocument(doc);
  const byId = new Map<string, ResolvedToken>();
  for (const token of tokens) {
    byId.set(token.id, token);
  }
  return byId;
};

/** Compute the diff between two token sets. */
export const diffTokens = (
  oldTokens: ReadonlyMap<string, ResolvedToken>,
  newTokens: ReadonlyMap<string, ResolvedToken>,
): DiffResult => {
  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];

  for (const [id, newToken] of newTokens) {
    const oldToken = oldTokens.get(id);
    if (oldToken === undefined) {
      added.push({
        type: "added",
        id,
        path: newToken.path,
        newValue: newToken.value,
        ...(newToken.description !== undefined ? { description: newToken.description } : {}),
      });
    } else if (!valuesEqual(oldToken.value, newToken.value)) {
      changed.push({
        type: "changed",
        id,
        path: newToken.path,
        oldValue: oldToken.value,
        newValue: newToken.value,
        ...(newToken.description !== undefined ? { description: newToken.description } : {}),
      });
    }
  }

  for (const [id, oldToken] of oldTokens) {
    if (!newTokens.has(id)) {
      removed.push({
        type: "removed",
        id,
        path: oldToken.path,
        oldValue: oldToken.value,
        ...(oldToken.description !== undefined ? { description: oldToken.description } : {}),
      });
    }
  }

  return { added, removed, changed };
};

/** Deep equality check for token values. */
const valuesEqual = (a: TokenValue, b: TokenValue): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => valuesEqual(item, b[i]));
    }
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => key in bObj && valuesEqual(aObj[key] as TokenValue, bObj[key] as TokenValue));
  }
  return false;
};

/** Run the full diff: read both files, compute diff, return result. */
export const runDiff = async (oldPath: string, newPath: string): Promise<DiffResult> => {
  const [oldTokens, newTokens] = await Promise.all([
    resolveTokens(oldPath),
    resolveTokens(newPath),
  ]);
  return diffTokens(oldTokens, newTokens);
};

/** Format a single token value for display. */
const displayValue = (value: TokenValue): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

/** Format a diff result as human-readable terminal output. */
export const formatDiffTerminal = (result: DiffResult): string => {
  const lines: string[] = [];
  const total = result.added.length + result.removed.length + result.changed.length;
  if (total === 0) {
    lines.push("  No differences found.");
    return lines.join("\n");
  }

  if (result.added.length > 0) {
    lines.push(`  Added (${result.added.length}):`);
    for (const entry of result.added) {
      lines.push(`    + ${entry.id}    ${displayValue(entry.newValue!)}`);
    }
  }

  if (result.removed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`  Removed (${result.removed.length}):`);
    for (const entry of result.removed) {
      lines.push(`    - ${entry.id}    ${displayValue(entry.oldValue!)}`);
    }
  }

  if (result.changed.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`  Changed (${result.changed.length}):`);
    for (const entry of result.changed) {
      lines.push(`    ~ ${entry.id}    ${displayValue(entry.oldValue!)} → ${displayValue(entry.newValue!)}`);
    }
  }

  return lines.join("\n");
};

/** Format a diff result as a JSON-serializable array. */
export const formatDiffJson = (result: DiffResult): DiffEntry[] => {
  return [...result.added, ...result.removed, ...result.changed];
};
