import { describe, it, expect } from 'vitest';
import { parseTokenDocument, parseTokenJson, parseTokenTree } from './parser.js';
import { ParseError } from '../utils/errors.js';

const colorDoc = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
    secondary: { $value: '{color.primary}' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
  },
};

describe('parser', () => {
  it('parses a minimal color + dimension document into a flat token list', () => {
    const doc = parseTokenDocument(colorDoc);
    expect(doc.tokens.map((t) => t.id)).toEqual(['color.primary', 'color.secondary', 'spacing.small']);
    const primary = doc.tokens[0]!;
    expect(primary.kind).toBe('token');
    expect(primary.name).toBe('primary');
    expect(primary.path).toEqual(['color', 'primary']);
    expect(primary.$value).toBe('#1a73e8');
    expect(primary.$description).toBe('Primary brand color');
    // Group $type is attached to the group node, not yet inherited onto tokens.
    expect(doc.tree.children['color']?.kind).toBe('group');
    expect(doc.tree.children['color']?.kind === 'group' && doc.tree.children['color']?.$type).toBe('color');
    // The secondary token keeps its raw reference; resolver expands it later.
    expect(doc.tokens[1]?.$value).toBe('{color.primary}');
  });

  it('preserves JSON insertion order (document order) in the flat token list', () => {
    const doc = parseTokenDocument({
      a: { $type: 'number', x: { $value: 1 }, y: { $value: 2 } },
      b: { $type: 'number', z: { $value: 3 } },
    });
    expect(doc.tokens.map((t) => t.id)).toEqual(['a.x', 'a.y', 'b.z']);
  });

  it('rejects a top-level non-object document', () => {
    expect(() => parseTokenDocument([1, 2, 3])).toThrow(ParseError);
    expect(() => parseTokenDocument('not an object')).toThrow(/must be a JSON object/);
  });

  it('rejects a top-level bare token (document must be a group)', () => {
    expect(() => parseTokenDocument({ $value: '#fff', $type: 'color' })).toThrow(/cannot be a single token/);
  });

  it('rejects an invalid $type value', () => {
    expect(() => parseTokenDocument({ color: { $type: 'hex', red: { $value: '#f00' } } })).toThrow(/invalid \$type/);
  });

  it('rejects a node that mixes $value and child keys', () => {
    expect(() =>
      parseTokenDocument({
        color: { $value: '#fff', $type: 'color', red: { $value: '#f00' } },
      }),
    ).toThrow(/both "\$value" and child keys/);
  });

  it('rejects a non-object child in a group', () => {
    expect(() => parseTokenDocument({ color: { $type: 'color', red: 42 } })).toThrow(
      /expected a child object but found number/,
    );
  });

  it('rejects a non-object $extensions', () => {
    expect(() =>
      parseTokenDocument({
        color: { $type: 'color', red: { $value: '#f00', $extensions: 'nope' } },
      }),
    ).toThrow(/non-object \$extensions/);
  });

  it('carries $extensions through to parsed tokens', () => {
    const doc = parseTokenDocument({
      color: {
        $type: 'color',
        red: { $value: '#f00', $extensions: { 'com.example': { mode: 'dark' } } },
      },
    });
    expect(doc.tokens[0]?.$extensions).toEqual({ 'com.example': { mode: 'dark' } });
  });

  it('parseTokenTree returns the root group node', () => {
    const tree = parseTokenTree(colorDoc);
    expect(tree.kind).toBe('group');
    expect(tree.children['spacing']?.kind).toBe('group');
  });

  it('parseTokenJson throws ParseError on invalid JSON', () => {
    expect(() => parseTokenJson('{ not valid', 'inline')).toThrow(ParseError);
  });
});
