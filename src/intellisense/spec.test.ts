import { describe, it, expect } from 'vitest';
import { buildCompletionSpec, COMPLETION_SPEC_URL } from './spec.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';

const SAMPLE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
    secondary: { $value: '{color.primary}' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
  },
  typography: {
    heading: {
      $type: 'typography',
      h1: {
        $value: { fontFamily: 'Inter, sans-serif', fontSize: '32px', fontWeight: '700' },
        $description: 'Main heading style',
      },
    },
  },
};

const spec = (): ReturnType<typeof buildCompletionSpec> =>
  buildCompletionSpec(resolveDocument(parseTokenDocument(SAMPLE)));

describe('completion spec', () => {
  it('carries stable document metadata', () => {
    const document = spec();
    expect(document.$schema).toBe(COMPLETION_SPEC_URL);
    expect(document.version).toBe(1);
  });

  it('emits one entry per resolved token in document order', () => {
    const document = spec();
    expect(document.tokens.map((token) => token.id)).toEqual([
      'color.primary',
      'color.secondary',
      'spacing.small',
      'typography.heading.h1',
    ]);
  });

  it('derives cssVariable, identifier, and detail for each token', () => {
    const document = spec();
    const color = document.tokens[0]!;
    expect(color.type).toBe('color');
    expect(color.value).toBe('#1a73e8');
    expect(color.description).toBe('Primary brand color');
    expect(color.cssVariable).toBe('--color-primary');
    expect(color.identifier).toBe('colorPrimary');
    expect(color.detail).toBe('#1a73e8');
  });

  it('formats composite values as JSON detail', () => {
    const document = spec();
    const typography = document.tokens[3]!;
    expect(typography.cssVariable).toBe('--typography-heading-h1');
    expect(typography.identifier).toBe('typographyHeadingH1');
    expect(typography.detail).toContain('"fontFamily"');
  });

  it('omits the description field when a token has none', () => {
    const document = spec();
    const spacing = document.tokens[2]!;
    expect(spacing.description).toBeUndefined();
    expect(Object.keys(spacing)).not.toContain('description');
  });

  it('is deterministic across builds', () => {
    expect(JSON.stringify(spec())).toBe(JSON.stringify(spec()));
  });
});
