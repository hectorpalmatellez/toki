/**
 * `toki completions` command handler: reads a token file and writes the
 * editor completion artifacts:
 *
 * - `spec.json`            — editor-agnostic completion spec
 * - `tokens.code-snippets` — VS Code snippet file
 * - `tokens.lsp.json`      — LSP `CompletionItem[]` document
 *
 * All files are deterministic JSON (same input → byte-identical output).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTokenDocument, parseTokenJson, readTokenFileRaw } from '../core/parser.js';
import { resolveDocument } from '../core/resolver.js';
import { themePath } from '../utils/format.js';
import { buildCompletionSpec } from './spec.js';
import { buildVsCodeSnippets } from './vscode.js';
import { buildLspCompletions } from './lsp.js';

/** Supported editor targets for the `toki completions` command. */
export type EditorTarget = 'spec' | 'vscode' | 'lsp';

/** All supported editor targets, in write order. */
export const EDITOR_TARGETS: readonly EditorTarget[] = ['spec', 'vscode', 'lsp'];

/** Options for the `toki completions` command handler. */
export interface CompletionWriteOptions {
  readonly input: string;
  readonly output: string;
  readonly editors?: readonly EditorTarget[];
  readonly theme?: string;
}

/** Read + resolve a token file, write completion artifacts, return paths. */
export const writeCompletionFiles = async (options: CompletionWriteOptions): Promise<readonly string[]> => {
  const editors = options.editors ?? EDITOR_TARGETS;
  const raw = await readTokenFileRaw(options.input);
  const doc = parseTokenDocument(parseTokenJson(raw, options.input), options.input);
  const tokens = resolveDocument(doc);
  const spec = buildCompletionSpec(tokens);

  const files: { readonly relativePath: string; readonly content: string }[] = [];
  if (editors.includes('spec')) {
    files.push({ relativePath: 'spec.json', content: `${JSON.stringify(spec, null, 2)}\n` });
  }
  if (editors.includes('vscode')) {
    files.push({
      relativePath: 'tokens.code-snippets',
      content: `${JSON.stringify(buildVsCodeSnippets(spec), null, 2)}\n`,
    });
  }
  if (editors.includes('lsp')) {
    files.push({
      relativePath: 'tokens.lsp.json',
      content: `${JSON.stringify({ completions: buildLspCompletions(spec) }, null, 2)}\n`,
    });
  }

  await mkdir(options.output, { recursive: true });
  const written: string[] = [];
  for (const file of files) {
    const relativePath = options.theme !== undefined ? themePath(file.relativePath, options.theme) : file.relativePath;
    await writeFile(join(options.output, relativePath), file.content, 'utf8');
    written.push(relativePath);
  }
  return written;
};
