import { describe, it, expect } from 'vitest';
import { extractCssProperties } from '../css-properties.js';

const SOURCE = 'test.css';

describe('extractCssProperties', () => {
  it('extracts standard custom properties', () => {
    const css = `:root {
  --color-primary: #1a73e8;
  --color-secondary: #5f6368;
  --spacing-md: 16px;
}`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens.length).toBe(3);
    expect(tokens[0]?.id).toBe('color-primary');
    expect(tokens[0]?.value).toBe('#1a73e8');
    expect(tokens[0]?.inferredType).toBe('color');
    expect(tokens[0]?.source).toBe(SOURCE);
    expect(tokens[0]?.line).toBe(2);
    expect(tokens[1]?.id).toBe('color-secondary');
    expect(tokens[2]?.id).toBe('spacing-md');
    expect(tokens[2]?.inferredType).toBe('dimension');
  });

  it('handles multi-word values', () => {
    const css = `:root {
  --shadow-lg: 0 4px 6px rgba(0, 0, 0, 0.1);
}`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.id).toBe('shadow-lg');
    expect(tokens[0]?.value).toBe('0 4px 6px rgba(0, 0, 0, 0.1)');
  });

  it('skips block comments', () => {
    const css = `:root {
  /* --color-comment: #000; */
  --color-primary: #1a73e8;
}`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.id).toBe('color-primary');
  });

  it('skips line comments', () => {
    const css = `:root {
  // --color-comment: #000;
  --color-primary: #1a73e8;
}`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.id).toBe('color-primary');
  });

  it('strips !important', () => {
    const css = `:root {
  --color-primary: #1a73e8 !important;
}`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.value).toBe('#1a73e8');
  });

  it('returns empty for empty content', () => {
    expect(extractCssProperties('', SOURCE)).toEqual([]);
    expect(extractCssProperties('  \n\n  ', SOURCE)).toEqual([]);
  });

  it('returns empty for CSS without custom properties', () => {
    const css = `.foo { color: red; margin: 8px; }`;
    expect(extractCssProperties(css, SOURCE)).toEqual([]);
  });

  it('handles values without trailing semicolons', () => {
    const css = `:root { --color-primary: #1a73e8 }`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.value).toBe('#1a73e8');
  });

  it('tracks correct line numbers', () => {
    const css = `
:root {
  --a: 1px;
  --b: 2px;

  --c: 3px;
}`;
    const tokens = extractCssProperties(css, SOURCE);
    expect(tokens[0]?.line).toBe(3);
    expect(tokens[1]?.line).toBe(4);
    expect(tokens[2]?.line).toBe(6);
  });
});
