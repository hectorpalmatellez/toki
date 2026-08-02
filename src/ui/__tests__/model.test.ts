import { describe, expect, it } from 'vitest';
import {
  TYPE_SPECS,
  buildTree,
  extractTokens,
  formToValue,
  getTypeSpec,
  parseRawValue,
  valueToForm,
  valueToRawText,
} from '../model.js';

const SAMPLE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
    secondary: { $value: '{color.primary}', $description: 'Alias' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
  },
  typography: {
    heading: {
      $type: 'typography',
      heading1: {
        $value: { fontFamily: 'Inter', fontSize: '32px', fontWeight: '700', lineHeight: '1.2' },
      },
    },
  },
} as const;

describe('extractTokens', () => {
  it('flattens a DTCG tree with $type inheritance', () => {
    const tokens = extractTokens(SAMPLE);
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toMatchObject({ group: 'color', name: 'primary', type: 'color' });
    expect(tokens[1]).toMatchObject({ group: 'color', name: 'secondary', type: 'color' });
    expect(tokens[2]).toMatchObject({ group: 'spacing', name: 'small', type: 'dimension' });
    expect(tokens[3]).toMatchObject({ group: 'typography', name: 'heading.heading1', type: 'typography' });
  });

  it('keeps descriptions', () => {
    const tokens = extractTokens(SAMPLE);
    expect(tokens[0]?.description).toBe('Primary brand color');
    expect(tokens[2]?.description).toBeUndefined();
  });

  it('prefers an explicit token $type over the group type', () => {
    const tree = { color: { $type: 'color', weird: { $value: '8px', $type: 'dimension' } } };
    const tokens = extractTokens(tree);
    expect(tokens[0]?.type).toBe('dimension');
  });

  it('handles a bare top-level token (no group)', () => {
    const tokens = extractTokens({ primary: { $value: '#fff' } });
    expect(tokens[0]).toMatchObject({ group: 'tokens', name: 'primary' });
    expect(tokens[0]?.type).toBe('color');
  });

  it('ignores non-object values', () => {
    expect(extractTokens({ color: '#fff' })).toHaveLength(0);
  });
});

describe('buildTree', () => {
  it('round-trips tokens back to a valid DTCG tree', () => {
    const flat = extractTokens(SAMPLE);
    const tree = buildTree(flat);
    const reparsed = extractTokens(tree);
    expect(reparsed).toEqual(flat);
  });

  it('writes an explicit $type on every token node', () => {
    const tree = buildTree([{ group: 'color', name: 'primary', type: 'color', value: '#fff' }]);
    const color = (tree['color'] as Record<string, unknown>)['primary'] as Record<string, unknown>;
    expect(color['$type']).toBe('color');
    expect(color['$value']).toBe('#fff');
  });

  it('keeps descriptions only when non-empty', () => {
    const tree = buildTree([
      { group: 'color', name: 'a', type: 'color', value: '#fff', description: 'hello' },
      { group: 'color', name: 'b', type: 'color', value: '#000', description: '' },
    ]);
    const group = tree['color'] as Record<string, unknown>;
    expect((group['a'] as Record<string, unknown>)['$description']).toBe('hello');
    expect('$description' in (group['b'] as Record<string, unknown>)).toBe(false);
  });
});

describe('raw value helpers', () => {
  it('serializes raw values to text', () => {
    expect(valueToRawText('{color.primary}')).toBe('{color.primary}');
    expect(valueToRawText(8)).toBe('8');
    expect(valueToRawText([0.42, 0, 0.58, 1])).toBe('[0.42,0,0.58,1]');
  });

  it('parses text back into values', () => {
    expect(parseRawValue('{color.primary}')).toBe('{color.primary}');
    expect(parseRawValue('8')).toBe(8);
    expect(parseRawValue('[0.42,0,0.58,1]')).toEqual([0.42, 0, 0.58, 1]);
    expect(parseRawValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseRawValue('')).toBe('');
  });
});

describe('structured forms', () => {
  it('round-trips every type via its form', () => {
    const cases: Array<[string, unknown]> = [
      ['color', '#1a73e8'],
      ['dimension', '8px'],
      ['dimension', '1.5rem'],
      ['duration', '200ms'],
      ['letterSpacing', '0.02em'],
      ['number', 3.5],
      ['lineHeight', '1.5'],
      ['lineHeight', '24px'],
      ['fontFamily', 'Inter, sans-serif'],
      ['fontWeight', '700'],
      ['cubicBezier', [0.42, 0, 0.58, 1]],
      ['typography', { fontFamily: 'Inter', fontSize: '32px', fontWeight: '700', lineHeight: '1.2' }],
      ['shadow', { color: '#00000040', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '0px', type: 'inner' }],
      ['border', { color: '#000', width: '1px', style: 'dashed' }],
      ['transition', { duration: '200ms', delay: '0ms', timingFunction: 'ease' }],
    ];
    for (const [type, value] of cases) {
      const spec = getTypeSpec(type as (typeof TYPE_SPECS)[number]['type']);
      const form = valueToForm(spec, value);
      expect(form, `${type} → form`).not.toBeNull();
      expect(formToValue(spec, form ?? {}), type).toEqual(value);
    }
  });

  it('falls back to the raw editor for references', () => {
    for (const type of ['color', 'dimension', 'duration'] as const) {
      const spec = getTypeSpec(type);
      expect(valueToForm(spec, '{color.primary}')).toBeNull();
    }
  });

  it('falls back for composite values of the wrong shape', () => {
    expect(valueToForm(getTypeSpec('shadow'), '0 2px 4px rgba(0,0,0,0.3)')).toBeNull();
    expect(valueToForm(getTypeSpec('typography'), '16px/1.5 Inter')).toBeNull();
  });

  it('writes per-type default values for new tokens', () => {
    for (const spec of TYPE_SPECS) {
      expect(spec.defaultValue).toBeDefined();
    }
  });
});
