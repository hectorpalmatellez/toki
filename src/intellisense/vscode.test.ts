import { describe, it, expect } from 'vitest';
import { buildVsCodeSnippets } from './vscode.js';
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

describe('vscode snippets', () => {
  it('emits one snippet per token keyed by dotted id', () => {
    const snippets = buildVsCodeSnippets(spec);
    expect(Object.keys(snippets).toSorted()).toEqual(['color.primary', 'spacing.small']);
  });

  it('offers dotted, kebab, and camel prefixes', () => {
    const snippets = buildVsCodeSnippets(spec);
    expect(snippets['color.primary']?.prefix).toEqual(['color.primary', 'color-primary', 'colorPrimary']);
  });

  it('inserts the canonical var() reference', () => {
    const snippets = buildVsCodeSnippets(spec);
    expect(snippets['color.primary']?.body).toEqual(['var(--color-primary)']);
    expect(snippets['spacing.small']?.body).toEqual(['var(--spacing-small)']);
  });

  it('describes the value and token description', () => {
    const snippets = buildVsCodeSnippets(spec);
    expect(snippets['color.primary']?.description).toBe('#1a73e8 — Primary brand color');
    expect(snippets['spacing.small']?.description).toBe('8px');
  });
});
