import { describe, it, expect } from 'vitest';
import { buildLspCompletions, LSP_KIND_VALUE, LSP_INSERT_TEXT_FORMAT_PLAIN } from './lsp.js';
import { buildCompletionSpec } from './spec.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';

const spec = buildCompletionSpec(
  resolveDocument(
    parseTokenDocument({
      color: {
        $type: 'color',
        primary: { $value: '#1a73e8', $description: 'Primary brand color' },
      },
      spacing: { $type: 'dimension', small: { $value: '8px' } },
    }),
  ),
);

describe('lsp completions', () => {
  it('emits one CompletionItem per token in document order', () => {
    const items = buildLspCompletions(spec);
    expect(items.map((item) => item.label)).toEqual(['color.primary', 'spacing.small']);
  });

  it('fills the value kind, plain-text insert format, and var() text', () => {
    const items = buildLspCompletions(spec);
    const color = items[0]!;
    expect(color.kind).toBe(LSP_KIND_VALUE);
    expect(color.insertTextFormat).toBe(LSP_INSERT_TEXT_FORMAT_PLAIN);
    expect(color.insertText).toBe('var(--color-primary)');
    expect(color.detail).toBe('#1a73e8');
  });

  it('combines dotted, kebab, and camel forms in filterText', () => {
    const items = buildLspCompletions(spec);
    expect(items[0]?.filterText).toBe('color.primary color-primary colorPrimary');
  });

  it('zero-pads sortText for deterministic ordering', () => {
    const items = buildLspCompletions(spec);
    expect(items[0]?.sortText).toBe('0000');
    expect(items[1]?.sortText).toBe('0001');
  });

  it('attaches markdown documentation when a description exists', () => {
    const items = buildLspCompletions(spec);
    expect(items[0]?.documentation).toEqual({
      kind: 'markdown',
      value: '**color.primary** — Primary brand color',
    });
    expect(items[1]?.documentation).toBeUndefined();
  });
});
