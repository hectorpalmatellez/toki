import { describe, it, expect } from 'vitest';
import { tailwindGenerator, resolveNamespace, renderThemeBlock } from './tailwind.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';
import type { ResolvedToken } from '../core/types.js';

const generate = async (raw: unknown, theme?: string) => {
  const tokens = resolveDocument(parseTokenDocument(raw));
  const artifacts = await tailwindGenerator.generate(tokens, {
    version: '0.1.0',
    ...(theme !== undefined ? { theme } : {}),
  });
  const cssArtifact = artifacts.find((a) => a.relativePath.endsWith('.css'));
  if (cssArtifact === undefined) throw new Error('missing CSS artifact');
  return { artifacts, css: cssArtifact.content };
};

describe('tailwind generator', () => {
  it('maps color tokens to --color-* namespace', async () => {
    const { css } = await generate({
      color: {
        $type: 'color',
        primary: { $value: '#1a73e8' },
        brand: { secondary: { $value: '#6c757d' } },
      },
    });
    expect(css).toContain('--color-primary: #1a73e8;');
    expect(css).toContain('--color-brand-secondary: #6c757d;');
  });

  it('maps dimension tokens to --spacing-* namespace', async () => {
    const { css } = await generate({
      spacing: {
        $type: 'dimension',
        small: { $value: '8px' },
        medium: { $value: '16px' },
      },
    });
    expect(css).toContain('--spacing-small: 8px;');
    expect(css).toContain('--spacing-medium: 16px;');
  });

  it('uses path prefix as namespace when it matches a Tailwind keyword', async () => {
    const { css } = await generate({
      radius: {
        $type: 'dimension',
        lg: { $value: '8px' },
        full: { $value: '9999px' },
      },
    });
    expect(css).toContain('--radius-lg: 8px;');
    expect(css).toContain('--radius-full: 9999px;');
  });

  it('expands composite types into namespace-mapped CSS variables', async () => {
    const { css } = await generate({
      type: {
        $type: 'typography',
        body: { $value: { fontFamily: 'Inter', fontSize: '16px' } },
      },
      border: {
        $type: 'border',
        default: { $value: { width: '1px', style: 'solid', color: '#e0e0e0' } },
      },
      transition: {
        $type: 'transition',
        fade: { $value: { duration: '300ms', timingFunction: 'ease-in-out', delay: '0ms' } },
      },
    });
    expect(css).toContain('--font-family-body: Inter;');
    expect(css).toContain('--font-size-body: 16px;');
    expect(css).toContain('--border-width-default: 1px;');
    expect(css).toContain('--border-style-default: solid;');
    expect(css).toContain('--color-default: #e0e0e0;');
    expect(css).toContain('--duration-fade: 300ms;');
    expect(css).toContain('--ease-fade: ease-in-out;');
  });

  it('skips shadow tokens', async () => {
    const { css } = await generate({
      shadow: {
        $type: 'shadow',
        lg: { $value: { x: 0, y: 4, blur: 6, color: 'rgba(0,0,0,0.1)' } },
      },
    });
    expect(css).not.toContain('--shadow-lg');
  });

  it('produces themed output paths', async () => {
    const { artifacts } = await generate({ color: { $type: 'color', primary: { $value: '#fff' } } }, 'light');
    const paths = artifacts.map((a) => a.relativePath).sort();
    expect(paths).toEqual(['tailwind/README.md', 'tailwind/tokens.light.css']);
  });

  it('produces valid empty @theme {} block for shadow-only token set', async () => {
    const { css } = await generate({
      shadow: {
        $type: 'shadow',
        lg: { $value: { x: 0, y: 4, blur: 6, color: 'rgba(0,0,0,0.1)' } },
      },
    });
    expect(css).toContain('@theme {');
    expect(css).toContain('}');
    expect(css).not.toContain('--shadow-lg');
  });

  it('supports naming convention override', () => {
    const tokens = resolveDocument(
      parseTokenDocument({
        color: {
          $type: 'color',
          'brand-primary': { $value: '#1a73e8' },
        },
      }),
    );
    const css = renderThemeBlock(tokens, { version: '0.1.0', naming: 'camelCase' });
    expect(css).toContain('--color-brandPrimary: #1a73e8;');
  });

  it('produces deterministic output', async () => {
    const fixture = {
      color: { $type: 'color', primary: { $value: '#1a73e8' } },
      spacing: { $type: 'dimension', small: { $value: '8px' } },
    };
    const { css: first } = await generate(fixture);
    const { css: second } = await generate(fixture);
    expect(first).toBe(second);
  });

  it('renders cubicBezier values as cubic-bezier() in --ease-* namespace', async () => {
    const { css } = await generate({
      ease: {
        $type: 'cubicBezier',
        'in-out': { $value: [0.4, 0, 0.2, 1] },
      },
    });
    expect(css).toContain('--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);');
  });

  it('emits tokens.css and README.md under tailwind/', async () => {
    const { artifacts } = await generate({
      color: { $type: 'color', primary: { $value: '#1a73e8' } },
    });
    expect(artifacts.map((a) => a.relativePath).sort()).toEqual(['tailwind/README.md', 'tailwind/tokens.css']);
    expect(artifacts.every((a) => a.format === 'tailwind')).toBe(true);
  });

  it('includes the header comment', async () => {
    const { css } = await generate({
      color: { $type: 'color', primary: { $value: '#1a73e8' } },
    });
    expect(css.startsWith('/* Generated by toki v0.1.0 — do not edit */')).toBe(true);
  });

  it('does not duplicate namespace when path prefix matches namespace', async () => {
    const { css } = await generate({
      color: {
        $type: 'color',
        primary: { $value: '#1a73e8' },
      },
    });
    expect(css).toContain('--color-primary: #1a73e8;');
    expect(css).not.toContain('--color-color-primary');
  });

  it('maps fontWeight type to --font-weight-* namespace', async () => {
    const { css } = await generate({
      'font-weight': {
        $type: 'fontWeight',
        bold: { $value: '700' },
      },
    });
    expect(css).toContain('--font-weight-bold: 700;');
  });

  it('maps fontFamily type to --font-family-* namespace', async () => {
    const { css } = await generate({
      'font-family': {
        $type: 'fontFamily',
        sans: { $value: 'Inter, sans-serif' },
      },
    });
    expect(css).toContain('--font-family-sans: Inter, sans-serif;');
  });

  it('maps duration type to --duration-* namespace', async () => {
    const { css } = await generate({
      duration: {
        $type: 'duration',
        fast: { $value: '150ms' },
      },
    });
    expect(css).toContain('--duration-fast: 150ms;');
  });

  it('uses full path when namespace comes from type mapping', async () => {
    const { css } = await generate({
      brand: {
        $type: 'color',
        primary: { $value: '#1a73e8' },
      },
    });
    expect(css).toContain('--color-brand-primary: #1a73e8;');
  });

  it('handles single-segment path matching namespace', () => {
    const tokens = resolveDocument(
      parseTokenDocument({
        color: { $type: 'color', $value: '#fff' },
      }),
    );
    const css = renderThemeBlock(tokens, { version: '0.1.0' });
    expect(css).toContain('--color: #fff;');
  });

  it('excludes number tokens without a path prefix match', async () => {
    const { css } = await generate({
      misc: {
        $type: 'number',
        myValue: { $value: 42 },
      },
    });
    expect(css).not.toContain('--');
  });

  it('includes number tokens with a recognized path prefix', async () => {
    const { css } = await generate({
      opacity: {
        $type: 'number',
        half: { $value: 0.5 },
      },
    });
    expect(css).toContain('--opacity-half: 0.5;');
  });
});

describe('resolveNamespace', () => {
  const makeToken = (path: string[], type: string): ResolvedToken => ({
    id: path.join('.'),
    name: path[path.length - 1] ?? '',
    path,
    type: type as ResolvedToken['type'],
    value: '',
  });

  it('returns namespace from type mapping', () => {
    expect(resolveNamespace(makeToken(['brand', 'primary'], 'color'))).toBe('color');
    expect(resolveNamespace(makeToken(['layout', 'small'], 'dimension'))).toBe('spacing');
    expect(resolveNamespace(makeToken(['text', 'bold'], 'fontWeight'))).toBe('font-weight');
    expect(resolveNamespace(makeToken(['text', 'sans'], 'fontFamily'))).toBe('font-family');
    expect(resolveNamespace(makeToken(['text', 'body'], 'lineHeight'))).toBe('line-height');
    expect(resolveNamespace(makeToken(['text', 'tight'], 'letterSpacing'))).toBe('letter-spacing');
    expect(resolveNamespace(makeToken(['anim', 'fast'], 'duration'))).toBe('duration');
    expect(resolveNamespace(makeToken(['anim', 'ease'], 'cubicBezier'))).toBe('ease');
  });

  it('returns namespace from path prefix override', () => {
    expect(resolveNamespace(makeToken(['radius', 'lg'], 'dimension'))).toBe('radius');
    expect(resolveNamespace(makeToken(['opacity', 'half'], 'number'))).toBe('opacity');
    expect(resolveNamespace(makeToken(['z-index', 'modal'], 'number'))).toBe('z-index');
  });

  it('returns undefined for skipped types', () => {
    expect(resolveNamespace(makeToken(['shadow', 'lg'], 'shadow'))).toBeUndefined();
    expect(resolveNamespace(makeToken(['type', 'body'], 'typography'))).toBeUndefined();
    expect(resolveNamespace(makeToken(['border', 'default'], 'border'))).toBeUndefined();
    expect(resolveNamespace(makeToken(['transition', 'fade'], 'transition'))).toBeUndefined();
  });

  it('returns undefined for number type without a matching path prefix', () => {
    expect(resolveNamespace(makeToken(['misc', 'value'], 'number'))).toBeUndefined();
  });
});
