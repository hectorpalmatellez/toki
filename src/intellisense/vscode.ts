/**
 * VS Code snippet adapter (P10): completion spec → `.code-snippets` document.
 *
 * VS Code snippet files are JSON objects keyed by a unique snippet name; the
 * `prefix` (trigger text) and `body` (inserted text) drive autocomplete.
 * Toki emits one snippet per token keyed by its dotted id, with the kebab and
 * camel forms as alternative prefixes, inserting the canonical
 * `var(--color-primary)` reference.
 */

import type { CompletionSpec } from './spec.js';

/** One VS Code snippet entry (JSON-serializable `.code-snippets` shape). */
export interface VsCodeSnippet {
  readonly prefix: readonly string[];
  readonly body: readonly string[];
  readonly description: string;
}

/** Build the `.code-snippets` document (snippet name → snippet). */
export const buildVsCodeSnippets = (spec: CompletionSpec): Readonly<Record<string, VsCodeSnippet>> => {
  const snippets: Record<string, VsCodeSnippet> = {};
  for (const token of spec.tokens) {
    const description = [token.detail, token.description]
      .filter((part): part is string => part !== undefined && part.length > 0)
      .join(' — ');
    snippets[token.id] = {
      prefix: [token.id, token.cssVariable.slice(2), token.identifier],
      body: [`var(${token.cssVariable})`],
      description,
    };
  }
  return snippets;
};
