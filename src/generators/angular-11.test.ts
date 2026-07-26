import { describe, it, expect } from 'vitest';
import { angular11Generator } from './angular-11.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';

const FIXTURE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8' },
    brand: { accent: { $value: '#ff8800' } },
  },
  spacing: { $type: 'dimension', small: { $value: '8px' } },
  type: {
    $type: 'typography',
    body: { $value: { fontSize: '16px', lineHeight: '1.5' } },
  },
};

const generate = (raw: unknown) => {
  const tokens = resolveDocument(parseTokenDocument(raw));
  const artifacts = angular11Generator.generate(tokens, { version: '0.1.0' });
  const byPath = (suffix: string): string => {
    const artifact = artifacts.find((a) => a.relativePath === `angular-11/${suffix}`);
    if (artifact === undefined) throw new Error(`missing artifact angular-11/${suffix}`);
    return artifact.content;
  };
  return {
    artifacts,
    scssVars: byPath('_tokens.scss'),
    scssEntry: byPath('tokens.scss'),
    ts: byPath('tokens.ts'),
  };
};

describe('angular-11 generator', () => {
  it('emits the same $kebab-case SCSS variables as the angular format', () => {
    const { scssVars } = generate(FIXTURE);
    expect(scssVars).toContain('$color-primary: #1a73e8;');
    expect(scssVars).toContain('$color-brand-accent: #ff8800;');
    expect(scssVars).not.toContain('$type-body');
  });

  it('uses @import only in the entry stylesheet (no @use/@forward)', () => {
    const { scssVars, scssEntry } = generate(FIXTURE);
    expect(scssEntry).toContain('@import "tokens";');
    expect(scssEntry).toContain('--color-primary: #{$color-primary};');
    for (const scss of [scssVars, scssEntry]) {
      expect(scss).not.toContain('@use');
      expect(scss).not.toContain('@forward');
    }
  });

  it('emits CONSTANT_CASE TypeScript constants', () => {
    const { ts } = generate(FIXTURE);
    expect(ts).toContain('export const COLOR_PRIMARY = "#1a73e8";');
    expect(ts).toContain('export const TYPE_BODY = {"fontSize":"16px","lineHeight":"1.5"};');
  });

  it('does not emit an InjectionToken module (Angular 11 patterns differ)', () => {
    const { artifacts } = generate(FIXTURE);
    expect(artifacts.map((a) => a.relativePath).sort()).toEqual([
      'angular-11/README.md',
      'angular-11/_tokens.scss',
      'angular-11/tokens.scss',
      'angular-11/tokens.ts',
    ]);
    expect(artifacts.every((a) => a.format === 'angular-11')).toBe(true);
  });

  it('is deterministic', () => {
    expect(generate(FIXTURE).scssEntry).toBe(generate(FIXTURE).scssEntry);
  });

  it('matches the artifact snapshots', () => {
    const { scssVars, scssEntry, ts } = generate(FIXTURE);
    expect(scssVars).toMatchSnapshot();
    expect(scssEntry).toMatchSnapshot();
    expect(ts).toMatchSnapshot();
  });
});
