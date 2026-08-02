/**
 * LSP adapter (P10): completion spec → `CompletionItem[]`.
 *
 * Emits the JSON-serializable subset of the Language Server Protocol
 * `CompletionItem` for each token: `label` is the dotted token path,
 * `insertText` is the canonical `var(--color-primary)` reference,
 * `filterText` includes the dotted/kebab/camel forms, and `sortText` is
 * zero-padded so items stay in document order in any client.
 */

import type { CompletionSpec } from './spec.js';

/** LSP `MarkupContent` (markdown kind). */
export interface LspMarkupContent {
  readonly kind: 'markdown';
  readonly value: string;
}

/** JSON-serializable subset of an LSP `CompletionItem`. */
export interface LspCompletionItem {
  readonly label: string;
  /** LSP `CompletionItemKind` — all tokens use `Value` (6). */
  readonly kind: number;
  readonly detail: string;
  readonly documentation?: LspMarkupContent;
  readonly insertText: string;
  /** LSP `InsertTextFormat` — `PlainText` (1). */
  readonly insertTextFormat: number;
  readonly filterText: string;
  readonly sortText: string;
}

/** LSP `CompletionItemKind.Value`. */
export const LSP_KIND_VALUE = 6;

/** LSP `InsertTextFormat.PlainText`. */
export const LSP_INSERT_TEXT_FORMAT_PLAIN = 1;

/** Build LSP completion items from the completion spec (document order). */
export const buildLspCompletions = (spec: CompletionSpec): readonly LspCompletionItem[] =>
  spec.tokens.map((token, index) => ({
    label: token.id,
    kind: LSP_KIND_VALUE,
    detail: token.detail,
    ...(token.description !== undefined
      ? { documentation: { kind: 'markdown' as const, value: `**${token.id}** — ${token.description}` } }
      : {}),
    insertText: `var(${token.cssVariable})`,
    insertTextFormat: LSP_INSERT_TEXT_FORMAT_PLAIN,
    filterText: [token.id, token.cssVariable.slice(2), token.identifier].join(' '),
    sortText: String(index).padStart(4, '0'),
  }));
