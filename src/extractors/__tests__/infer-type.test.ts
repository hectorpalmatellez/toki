import { describe, it, expect } from 'vitest';
import { inferTokenType, TOKEN_TYPE_PATTERNS } from '../infer-type.js';

describe('inferTokenType', () => {
  describe('color', () => {
    it('detects 6-digit hex colors', () => {
      expect(inferTokenType('#1a73e8')).toBe('color');
      expect(inferTokenType('#AABBCC')).toBe('color');
    });

    it('detects 3-digit hex colors', () => {
      expect(inferTokenType('#abc')).toBe('color');
      expect(inferTokenType('#FFF')).toBe('color');
    });

    it('detects 8-digit hex colors (with alpha)', () => {
      expect(inferTokenType('#1a73e8ff')).toBe('color');
      expect(inferTokenType('#00000080')).toBe('color');
    });

    it('detects 4-digit hex colors (with alpha)', () => {
      expect(inferTokenType('#abcd')).toBe('color');
    });

    it('detects rgb() and rgba()', () => {
      expect(inferTokenType('rgb(26, 115, 232)')).toBe('color');
      expect(inferTokenType('rgba(26, 115, 232, 0.5)')).toBe('color');
      expect(inferTokenType('RGB(0, 0, 0)')).toBe('color');
    });

    it('detects hsl() and hsla()', () => {
      expect(inferTokenType('hsl(214, 81%, 53%)')).toBe('color');
      expect(inferTokenType('hsla(214, 81%, 53%, 0.8)')).toBe('color');
    });

    it('detects named CSS colors', () => {
      expect(inferTokenType('red')).toBe('color');
      expect(inferTokenType('rebeccapurple')).toBe('color');
      expect(inferTokenType('transparent')).toBe('color');
      expect(inferTokenType('CORAL')).toBe('color');
    });

    it('rejects non-color values', () => {
      expect(inferTokenType('#xyz')).toBeUndefined();
      expect(inferTokenType('#12')).toBeUndefined();
    });
  });

  describe('dimension', () => {
    it('detects px values', () => {
      expect(inferTokenType('16px')).toBe('dimension');
      expect(inferTokenType('0px')).toBe('dimension');
      expect(inferTokenType('-4px')).toBe('dimension');
      expect(inferTokenType('1.5px')).toBe('dimension');
    });

    it('detects rem values', () => {
      expect(inferTokenType('1rem')).toBe('dimension');
      expect(inferTokenType('0.5rem')).toBe('dimension');
    });

    it('detects em values', () => {
      expect(inferTokenType('2em')).toBe('dimension');
      expect(inferTokenType('1.5em')).toBe('dimension');
    });
  });

  describe('duration', () => {
    it('detects ms values', () => {
      expect(inferTokenType('300ms')).toBe('duration');
      expect(inferTokenType('0ms')).toBe('duration');
    });

    it('detects s values', () => {
      expect(inferTokenType('0.3s')).toBe('duration');
      expect(inferTokenType('1s')).toBe('duration');
    });
  });

  describe('fontWeight', () => {
    it('detects numeric weight values', () => {
      expect(inferTokenType('400')).toBe('fontWeight');
      expect(inferTokenType('700')).toBe('fontWeight');
      expect(inferTokenType('100')).toBe('fontWeight');
    });

    it('detects keyword weights', () => {
      expect(inferTokenType('normal')).toBe('fontWeight');
      expect(inferTokenType('bold')).toBe('fontWeight');
      expect(inferTokenType('lighter')).toBe('fontWeight');
      expect(inferTokenType('bolder')).toBe('fontWeight');
      expect(inferTokenType('BOLD')).toBe('fontWeight');
    });

    it('does not detect arbitrary numbers as fontWeight', () => {
      expect(inferTokenType('42')).toBe('number');
      expect(inferTokenType('150')).toBe('number');
    });
  });

  describe('fontFamily', () => {
    it('detects comma-separated font families', () => {
      expect(inferTokenType('Inter, sans-serif')).toBe('fontFamily');
      expect(inferTokenType('"Helvetica Neue", Arial, sans-serif')).toBe('fontFamily');
    });

    it('detects quoted font family strings', () => {
      expect(inferTokenType('"Inter"')).toBe('fontFamily');
      expect(inferTokenType("'Open Sans'")).toBe('fontFamily');
    });

    it('does not detect single generic names as fontFamily', () => {
      expect(inferTokenType('sans-serif')).toBeUndefined();
    });
  });

  describe('number', () => {
    it('detects unitless numbers', () => {
      expect(inferTokenType('1.5')).toBe('number');
      expect(inferTokenType('42')).toBe('number');
      expect(inferTokenType('0.85')).toBe('number');
      expect(inferTokenType('-1')).toBe('number');
    });
  });

  describe('unrecognized', () => {
    it('returns undefined for unrecognized values', () => {
      expect(inferTokenType('auto')).toBeUndefined();
      expect(inferTokenType('none')).toBeUndefined();
      expect(inferTokenType('linear-gradient(to right, #000, #fff)')).toBeUndefined();
      expect(inferTokenType('')).toBeUndefined();
      expect(inferTokenType('  ')).toBeUndefined();
    });
  });
});

describe('TOKEN_TYPE_PATTERNS', () => {
  it('has entries for every token type', () => {
    expect(TOKEN_TYPE_PATTERNS['color']).toBeDefined();
    expect(TOKEN_TYPE_PATTERNS['dimension']).toBeDefined();
    expect(TOKEN_TYPE_PATTERNS['duration']).toBeDefined();
    expect(TOKEN_TYPE_PATTERNS['fontWeight']).toBeDefined();
    expect(TOKEN_TYPE_PATTERNS['fontFamily']).toBeDefined();
    expect(TOKEN_TYPE_PATTERNS['number']).toBeDefined();
  });

  it('each entry has description, patterns, and examples', () => {
    const color = TOKEN_TYPE_PATTERNS['color'];
    expect(color?.description).toBeTruthy();
    expect(color?.patterns.length).toBeGreaterThan(0);
    expect(color?.examples.length).toBeGreaterThan(0);
  });
});
