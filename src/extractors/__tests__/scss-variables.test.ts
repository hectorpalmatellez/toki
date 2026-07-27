import { describe, it, expect } from 'vitest';
import { extractScssVariables } from '../scss-variables.js';

const SOURCE = 'test.scss';

describe('extractScssVariables', () => {
  it('extracts standard SCSS variables', () => {
    const scss = `$color-primary: #1a73e8;
$spacing-md: 16px;
$font-size-base: 1rem;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(3);
    expect(tokens[0]?.id).toBe('color-primary');
    expect(tokens[0]?.value).toBe('#1a73e8');
    expect(tokens[0]?.inferredType).toBe('color');
    expect(tokens[1]?.id).toBe('spacing-md');
    expect(tokens[1]?.inferredType).toBe('dimension');
  });

  it('strips !default flag', () => {
    const scss = `$color-primary: #1a73e8 !default;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.value).toBe('#1a73e8');
  });

  it('strips !global flag', () => {
    const scss = `$color-primary: #1a73e8 !global;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.value).toBe('#1a73e8');
  });

  it('strips both !default and !global', () => {
    const scss = `$color-primary: #1a73e8 !default !global;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.value).toBe('#1a73e8');
  });

  it('skips SCSS maps', () => {
    const scss = `$breakpoints: (
  small: 576px,
  medium: 768px,
  large: 992px
);
$color-primary: #1a73e8;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.id).toBe('color-primary');
  });

  it('skips block comments', () => {
    const scss = `/* $color-comment: #000; */
$color-primary: #1a73e8;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.id).toBe('color-primary');
  });

  it('skips line comments', () => {
    const scss = `// $color-comment: #000;
$color-primary: #1a73e8;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.id).toBe('color-primary');
  });

  it('returns empty for empty content', () => {
    expect(extractScssVariables('', SOURCE)).toEqual([]);
  });

  it('returns empty for SCSS without variables', () => {
    const scss = `.foo { color: red; }`;
    expect(extractScssVariables(scss, SOURCE)).toEqual([]);
  });

  it('tracks correct line numbers', () => {
    const scss = `$a: 1px;

$b: 2px;
// comment
$c: 3px;`;
    const tokens = extractScssVariables(scss, SOURCE);
    expect(tokens[0]?.line).toBe(1);
    expect(tokens[1]?.line).toBe(3);
    expect(tokens[2]?.line).toBe(5);
  });
});
