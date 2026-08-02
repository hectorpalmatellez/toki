import { describe, it, expect } from 'vitest';
import { reactGenerator } from './react.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';
import { GeneratorError } from '../utils/errors.js';

const FIXTURE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8' },
    secondary: { $value: '{color.primary}' },
    brand: { accent: { $value: '#ff8800' } },
  },
  spacing: { $type: 'dimension', small: { $value: '8px' }, medium: { $value: '16px' } },
  type: {
    $type: 'typography',
    body: { $value: { fontSize: '16px', lineHeight: '1.5' } },
  },
};

const generate = async (raw: unknown) => {
  const tokens = resolveDocument(parseTokenDocument(raw));
  const artifacts = await reactGenerator.generate(tokens, { version: '0.1.0' });
  const byPath = (suffix: string): string => {
    const artifact = artifacts.find((a) => a.relativePath === `react/${suffix}`);
    if (artifact === undefined) throw new Error(`missing artifact react/${suffix}`);
    return artifact.content;
  };
  return { artifacts, theme: byPath('theme.ts'), css: byPath('tokens.css') };
};

describe('react generator — theme.ts', () => {
  it('nests the theme object by category (colors, spacing, typography)', async () => {
    const { theme } = await generate(FIXTURE);
    expect(theme).toContain('export const theme = {');
    expect(theme).toContain('colors: {');
    expect(theme).toContain('primary: "#1a73e8",');
    expect(theme).toContain('brand: {');
    expect(theme).toContain('accent: "#ff8800",');
    expect(theme).toContain('spacing: {');
    expect(theme).toContain('small: "8px",');
    expect(theme).toContain('types: {');
  });

  it('exports the theme as const with a Theme type and default export', async () => {
    const { theme } = await generate(FIXTURE);
    expect(theme).toContain('} as const;');
    expect(theme).toContain('export type Theme = typeof theme;');
    expect(theme).toContain('export default theme;');
  });

  it('keeps composite values as nested plain objects', async () => {
    const { theme } = await generate(FIXTURE);
    expect(theme).toContain('body: { fontSize: "16px", lineHeight: "1.5" },');
  });

  it('places single-segment tokens at the theme root', async () => {
    const { theme } = await generate({
      brand: { $type: 'color', $value: '#ffffff' },
      color: { $type: 'color', primary: { $value: '#000000' } },
    });
    expect(theme).toContain('brand: "#ffffff",');
    expect(theme).toContain('colors: {');
  });

  it('throws GeneratorError when a scalar collides with a category name', async () => {
    // `colors` (scalar) and `color.primary` (→ category `colors`) share a key.
    await expect(() =>
      generate({
        colors: { $type: 'color', $value: '#fff' },
        color: { $type: 'color', primary: { $value: '#000' } },
      }),
    ).rejects.toThrow(GeneratorError);
  });
});

describe('react generator — tokens.css companion', () => {
  it('emits :root custom properties for next-themes integration', async () => {
    const { css } = await generate(FIXTURE);
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #1a73e8;');
    expect(css).toContain('--type-body-font-size: 16px;');
    expect(css).toContain('--type-body-line-height: 1.5;');
  });
});

describe('react generator — artifacts', () => {
  it('writes theme.ts, tokens.css and README.md under react/', async () => {
    const { artifacts } = await generate(FIXTURE);
    expect(artifacts.map((a) => a.relativePath).sort()).toEqual([
      'react/README.md',
      'react/theme.ts',
      'react/tokens.css',
    ]);
    expect(artifacts.every((a) => a.format === 'react')).toBe(true);
  });

  it('is deterministic', async () => {
    expect((await generate(FIXTURE)).theme).toBe((await generate(FIXTURE)).theme);
  });

  it('matches the artifact snapshots', async () => {
    const { theme, css } = await generate(FIXTURE);
    expect(theme).toMatchSnapshot();
    expect(css).toMatchSnapshot();
  });
});
