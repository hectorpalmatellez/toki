import { describe, it, expect } from 'vitest';
import { stencilGenerator, renderTokensModule, renderUnionTypes } from './stencil.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';
import { GeneratorError } from '../utils/errors.js';

const FIXTURE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8' },
    secondary: { $value: '{color.primary}' },
  },
  spacing: { $type: 'dimension', small: { $value: '8px' }, medium: { $value: '16px' } },
  type: {
    $type: 'typography',
    body: { $value: { fontSize: '16px', lineHeight: '1.5' } },
  },
  motion: { $type: 'cubicBezier', ease: { $value: [0.4, 0, 0.2, 1] } },
};

const generate = (raw: unknown) => {
  const tokens = resolveDocument(parseTokenDocument(raw));
  const artifacts = stencilGenerator.generate(tokens, { version: '0.1.0' });
  const byPath = (suffix: string): string => {
    const artifact = artifacts.find((a) => a.relativePath === `stencil/${suffix}`);
    if (artifact === undefined) throw new Error(`missing artifact stencil/${suffix}`);
    return artifact.content;
  };
  return {
    artifacts,
    css: byPath('tokens.css'),
    ts: byPath('tokens.ts'),
    dts: byPath('tokens.d.ts'),
    types: byPath('types.ts'),
  };
};

describe('stencil generator', () => {
  it('emits :root CSS custom properties', () => {
    const { css } = generate(FIXTURE);
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #1a73e8;');
    expect(css).toContain('--color-secondary: #1a73e8;');
    expect(css).toContain('--spacing-small: 8px;');
    expect(css).toContain('--spacing-medium: 16px;');
    expect(css).toContain('--motion-ease: cubic-bezier(0.4, 0, 0.2, 1);');
    expect(css).not.toContain('--type-body');
  });

  it('emits camelCase exports for every token in tokens.ts', () => {
    const { ts } = generate(FIXTURE);
    expect(ts).toContain('export const colorPrimary = "#1a73e8";');
    expect(ts).toContain('export const colorSecondary = "#1a73e8";');
    expect(ts).toContain('export const spacingSmall = "8px";');
    expect(ts).toContain('export const spacingMedium = "16px";');
    expect(ts).toContain('export const motionEase = [0.4,0,0.2,1];');
    expect(ts).toContain('export const typeBody = {"fontSize":"16px","lineHeight":"1.5"};');
  });

  it('groups tokens by category using raw first path segment keys', () => {
    const { ts } = generate(FIXTURE);
    expect(ts).toContain('export const tokens = {');
    expect(ts).toContain('color: {');
    expect(ts).toContain('spacing: {');
    expect(ts).toContain('motion: {');
    expect(ts).toContain('type: {');
    expect(ts).toContain('} as const;');
    expect(ts).toContain('export type TokenCategory = keyof typeof tokens;');
  });

  it('nests tokens by remaining path segments within each category', () => {
    const { ts } = generate(FIXTURE);
    expect(ts).toContain('  primary: "#1a73e8",');
    expect(ts).toContain('  small: "8px",');
  });

  it('generates types.ts with per-category union types', () => {
    const { types } = generate(FIXTURE);
    expect(types).toContain('export type ColorToken =');
    expect(types).toContain('"color.primary"');
    expect(types).toContain('"color.secondary"');
    expect(types).toContain('export type SpacingToken =');
    expect(types).toContain('"spacing.small"');
    expect(types).toContain('"spacing.medium"');
    expect(types).toContain('export type MotionToken =');
    expect(types).toContain('"motion.ease"');
    expect(types).toContain('export type TypeToken =');
    expect(types).toContain('"type.body"');
  });

  it('generates types.ts with full TokenName union', () => {
    const { types } = generate(FIXTURE);
    expect(types).toContain('export type TokenName =');
    expect(types).toContain('ColorToken');
    expect(types).toContain('SpacingToken');
    expect(types).toContain('MotionToken');
    expect(types).toContain('TypeToken');
  });

  it('generates tokens.d.ts with type declarations', () => {
    const { dts } = generate(FIXTURE);
    expect(dts).toContain('export declare const colorPrimary: string;');
    expect(dts).toContain('export declare const colorSecondary: string;');
    expect(dts).toContain('export declare const spacingSmall: string;');
    expect(dts).toContain('export declare const spacingMedium: string;');
  });

  it('throws GeneratorError on identifier collisions', () => {
    expect(() =>
      generate({
        color: {
          $type: 'color',
          'brand-primary': { $value: '#fff' },
          brandPrimary: { $value: '#000' },
        },
      }),
    ).toThrow(GeneratorError);
  });

  it('writes five artifacts under stencil/', () => {
    const { artifacts } = generate(FIXTURE);
    expect(artifacts.map((a) => a.relativePath).sort()).toEqual([
      'stencil/README.md',
      'stencil/tokens.css',
      'stencil/tokens.d.ts',
      'stencil/tokens.ts',
      'stencil/types.ts',
    ]);
    expect(artifacts.every((a) => a.format === 'stencil')).toBe(true);
  });

  it('includes the header comment and is deterministic', () => {
    const { css, ts, dts, types } = generate(FIXTURE);
    const expected = '/* Generated by toki v0.1.0 — do not edit */';
    expect(css.startsWith(expected)).toBe(true);
    expect(ts.startsWith(expected)).toBe(true);
    expect(dts.startsWith(expected)).toBe(true);
    expect(types.startsWith(expected)).toBe(true);
    expect(ts).toBe(generate(FIXTURE).ts);
  });

  it('reuses themePath for multi-theme naming', () => {
    const tokens = resolveDocument(
      parseTokenDocument({ color: { $type: 'color', primary: { $value: '#1a73e8' } } }),
    );
    const artifacts = stencilGenerator.generate(tokens, { version: '0.1.0', theme: 'dark' });
    const paths = artifacts.map((a) => a.relativePath);
    expect(paths).toContain('stencil/tokens.dark.css');
    expect(paths).toContain('stencil/tokens.dark.ts');
    expect(paths).toContain('stencil/tokens.dark.d.ts');
    expect(paths).toContain('stencil/types.dark.ts');
    expect(paths).toContain('stencil/README.md');
  });

  it('matches the artifact snapshots', () => {
    const { css, ts, dts, types } = generate(FIXTURE);
    expect(css).toMatchSnapshot();
    expect(ts).toMatchSnapshot();
    expect(dts).toMatchSnapshot();
    expect(types).toMatchSnapshot();
  });
});
