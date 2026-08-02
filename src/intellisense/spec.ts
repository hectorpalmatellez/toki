/**
 * Editor-agnostic completion spec (P10): resolved tokens → completion entries.
 *
 * The spec is the normalized, editor-agnostic source of truth for design
 * token completions. VS Code snippets and LSP `CompletionItem`s are derived
 * from it (see `vscode.ts` and `lsp.ts`), so every editor surface stays in
 * sync with a single definition.
 *
 * Each entry carries the dotted token id (label), type, resolved value,
 * optional description, and the canonical consumption forms:
 *
 * - `cssVariable` — `--kebab-case` custom property (`--color-primary`)
 * - `identifier`  — camelCase export name (`colorPrimary`)
 * - `detail`      — the human-readable formatted value (`#1a73e8`)
 */

import type { ResolvedToken, TokenType, TokenValue } from '../core/types.js';
import { formatValue } from '../utils/format.js';
import { toCssVariable } from '../schemas/output.js';
import { makeIdentifier } from '../generators/js.js';

/** A single token completion entry. */
export interface CompletionEntry {
  /** Dotted token path, e.g. `color.primary`. */
  readonly id: string;
  readonly type: TokenType;
  readonly value: TokenValue;
  readonly description?: string;
  /** `--kebab-case` custom property name for this token. */
  readonly cssVariable: string;
  /** camelCase export identifier for this token. */
  readonly identifier: string;
  /** Human-readable formatted value, e.g. `#1a73e8`. */
  readonly detail: string;
}

/** The editor-agnostic completion document. */
export interface CompletionSpec {
  readonly $schema: string;
  readonly version: 1;
  readonly tokens: readonly CompletionEntry[];
}

/** Stable `$schema` URL for the completion spec document. */
export const COMPLETION_SPEC_URL = 'https://toki.design/schema/completions.json';

/** Build the completion spec from resolved tokens (document order). */
export const buildCompletionSpec = (tokens: readonly ResolvedToken[]): CompletionSpec => ({
  $schema: COMPLETION_SPEC_URL,
  version: 1,
  tokens: tokens.map((token) => ({
    id: token.id,
    type: token.type,
    value: token.value,
    ...(token.description !== undefined ? { description: token.description } : {}),
    cssVariable: toCssVariable(token.path),
    identifier: makeIdentifier(token.path),
    detail: formatValue(token.value),
  })),
});
