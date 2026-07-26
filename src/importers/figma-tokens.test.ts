/**
 * Tests for the Figma Tokens Studio importer (`src/importers/figma-tokens.ts`).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { convertFigmaTokens, importFigmaTokens } from './figma-tokens.js';
import { parseTokenDocument } from '../core/parser.js';

const tmpFile = (name: string): string => join(tmpdir(), `toki-figma-test-${name}.json`);
const tmpDir = (name: string): string => join(tmpdir(), `toki-figma-test-${name}`);
const cleanup: string[] = [];

afterEach(async () => {
  for (const f of cleanup) {
    await rm(f, { recursive: true, force: true });
  }
  cleanup.length = 0;
});

const writeJson = async (filePath: string, data: unknown): Promise<string> => {
  cleanup.push(filePath);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
};

describe('convertFigmaTokens', () => {
  it('strips theme key and converts tokens', () => {
    const input = {
      global: {
        color: {
          primary: { value: '#1a73e8', type: 'color' },
        },
      },
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color' },
      },
    });
  });

  it('strips $metadata and $themes', () => {
    const input = {
      global: {
        color: { primary: { value: '#000', type: 'color' } },
      },
      $metadata: { tokenSetOrder: ['global'] },
      $themes: [{ id: 'light' }],
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      color: { primary: { $value: '#000', $type: 'color' } },
    });
    expect(result).not.toHaveProperty('$metadata');
    expect(result).not.toHaveProperty('$themes');
  });

  it('converts description → $description', () => {
    const input = {
      global: {
        color: {
          primary: { value: '#1a73e8', type: 'color', description: 'Primary brand color' },
        },
      },
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color', $description: 'Primary brand color' },
      },
    });
  });

  it('preserves nested groups', () => {
    const input = {
      global: {
        color: {
          primary: { value: '#1a73e8', type: 'color' },
          secondary: { value: '#5f6368', type: 'color' },
        },
        spacing: {
          small: { value: '8px', type: 'dimension' },
        },
      },
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color' },
        secondary: { $value: '#5f6368', $type: 'color' },
      },
      spacing: {
        small: { $value: '8px', $type: 'dimension' },
      },
    });
  });

  it('preserves reference syntax', () => {
    const input = {
      global: {
        color: {
          primary: { value: '#1a73e8', type: 'color' },
          alias: { value: '{color.primary}', type: 'color' },
        },
      },
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color' },
        alias: { $value: '{color.primary}', $type: 'color' },
      },
    });
  });

  it('merges multiple theme groups into one root', () => {
    const input = {
      global: {
        color: { primary: { value: '#1a73e8', type: 'color' } },
      },
      brand: {
        spacing: { small: { value: '8px', type: 'dimension' } },
      },
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      color: { primary: { $value: '#1a73e8', $type: 'color' } },
      spacing: { small: { $value: '8px', $type: 'dimension' } },
    });
  });

  it('handles group-level $type', () => {
    const input = {
      global: {
        $type: 'color',
        primary: { value: '#1a73e8' },
        secondary: { value: '#5f6368' },
      },
    };
    const result = convertFigmaTokens(input);
    expect(result).toEqual({
      $type: 'color',
      primary: { $value: '#1a73e8' },
      secondary: { $value: '#5f6368' },
    });
  });

  it('throws on non-object input', () => {
    expect(() => convertFigmaTokens(null)).toThrow('must be a JSON object');
    expect(() => convertFigmaTokens('string')).toThrow('must be a JSON object');
    expect(() => convertFigmaTokens([1, 2])).toThrow('must be a JSON object');
  });

  it('throws on token missing value', () => {
    const input = { global: { color: { primary: { value: undefined, type: 'color' } } } };
    expect(() => convertFigmaTokens(input)).toThrow('missing a "value"');
  });

  it('throws on invalid type', () => {
    const input = { global: { color: { primary: { value: '#000', type: 'bogus' } } } };
    expect(() => convertFigmaTokens(input)).toThrow('unknown type');
  });

  it('throws when no token sets found', () => {
    const input = { $metadata: { tokenSetOrder: [] } };
    expect(() => convertFigmaTokens(input)).toThrow('No token sets found');
  });

  it('output validates as W3C DTCG', () => {
    const input = {
      global: {
        color: {
          $type: 'color',
          primary: { value: '#1a73e8', description: 'Primary' },
        },
        spacing: {
          $type: 'dimension',
          small: { value: '8px' },
        },
      },
    };
    const result = convertFigmaTokens(input);
    const doc = parseTokenDocument(result);
    expect(doc.tokens.length).toBeGreaterThan(0);
  });

  it('output validates with references', () => {
    const input = {
      global: {
        color: {
          primary: { value: '#1a73e8', type: 'color' },
          alias: { value: '{color.primary}', type: 'color' },
        },
      },
    };
    const result = convertFigmaTokens(input);
    const doc = parseTokenDocument(result);
    expect(doc.tokens).toHaveLength(2);
  });
});

describe('importFigmaTokens (integration)', () => {
  it('reads Figma TS file and writes DTCG tokens.json', async () => {
    const inputPath = tmpFile('figma-input');
    await writeJson(inputPath, {
      global: {
        color: {
          primary: { value: '#1a73e8', type: 'color', description: 'Primary brand color' },
        },
        spacing: {
          small: { value: '8px', type: 'dimension' },
        },
      },
      $metadata: { tokenSetOrder: ['global'] },
      $themes: [{ id: 'light' }],
    });

    const dir = tmpDir('figma-output');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });

    const writtenPath = await importFigmaTokens({
      input: inputPath,
      output: dir,
    });

    expect(writtenPath).toBe(join(dir, 'tokens.json'));

    const { readFileSync } = await import('node:fs');
    const output = JSON.parse(readFileSync(writtenPath, 'utf8')) as Record<string, unknown>;
    expect(output.color).toBeDefined();
    expect((output.color as Record<string, unknown>).primary).toEqual({
      $value: '#1a73e8',
      $type: 'color',
      $description: 'Primary brand color',
    });
  });

  it('defaults output to tokens.json in input directory', async () => {
    const dir = tmpDir('figma-default-out');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });

    const inputPath = join(dir, 'figma-tokens.json');
    await writeJson(inputPath, {
      global: { color: { primary: { value: '#000', type: 'color' } } },
    });

    const writtenPath = await importFigmaTokens({ input: inputPath });
    cleanup.push(writtenPath);

    expect(writtenPath).toBe(join(dir, 'tokens.json'));

    const { readFileSync, existsSync } = await import('node:fs');
    expect(existsSync(writtenPath)).toBe(true);
  });

  it('throws on invalid JSON file', async () => {
    const dir = tmpDir('figma-bad');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });
    const badPath = join(dir, 'bad.json');
    await writeFile(badPath, 'not json!!!', 'utf8');

    await expect(importFigmaTokens({ input: badPath })).rejects.toThrow('Invalid JSON');
  });

  it('throws on non-existent file', async () => {
    await expect(importFigmaTokens({ input: '/nonexistent/path/tokens.json' })).rejects.toThrow('Failed to read file');
  });

  it('handles file with only $metadata and $themes', async () => {
    const dir = tmpDir('figma-empty');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });
    const inputPath = join(dir, 'empty.json');
    await writeJson(inputPath, {
      $metadata: { tokenSetOrder: [] },
      $themes: [],
    });

    await expect(importFigmaTokens({ input: inputPath })).rejects.toThrow('No token sets found');
  });
});
