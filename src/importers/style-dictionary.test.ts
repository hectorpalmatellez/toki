/**
 * Tests for the Style Dictionary importer (`src/importers/style-dictionary.ts`).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { convertStyleDictionary, importStyleDictionary } from './style-dictionary.js';
import { parseTokenDocument } from '../core/parser.js';

const tmpFile = (name: string): string => join(tmpdir(), `toki-sd-test-${name}.json`);
const tmpDir = (name: string): string => join(tmpdir(), `toki-sd-test-${name}`);
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

describe('convertStyleDictionary', () => {
  it('converts value → $value', () => {
    const input = {
      color: {
        primary: { value: '#1a73e8' },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8' },
      },
    });
  });

  it('converts type → $type', () => {
    const input = {
      color: {
        primary: { value: '#1a73e8', type: 'color' },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color' },
      },
    });
  });

  it('converts comment → $description', () => {
    const input = {
      color: {
        primary: { value: '#1a73e8', comment: 'Primary brand color' },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $description: 'Primary brand color' },
      },
    });
  });

  it('converts description → $description (if comment absent)', () => {
    const input = {
      color: {
        primary: { value: '#1a73e8', description: 'Primary brand color' },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $description: 'Primary brand color' },
      },
    });
  });

  it('preserves group-level type as $type', () => {
    const input = {
      $type: 'color',
      primary: { value: '#1a73e8' },
      secondary: { value: '#5f6368' },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      $type: 'color',
      primary: { $value: '#1a73e8' },
      secondary: { $value: '#5f6368' },
    });
  });

  it('preserves nested groups', () => {
    const input = {
      color: {
        primary: { value: '#1a73e8', type: 'color' },
        secondary: { value: '#5f6368', type: 'color' },
      },
      spacing: {
        small: { value: '8px', type: 'dimension' },
        medium: { value: '16px', type: 'dimension' },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color' },
        secondary: { $value: '#5f6368', $type: 'color' },
      },
      spacing: {
        small: { $value: '8px', $type: 'dimension' },
        medium: { $value: '16px', $type: 'dimension' },
      },
    });
  });

  it('preserves reference syntax', () => {
    const input = {
      color: {
        primary: { value: '#1a73e8', type: 'color' },
        alias: { value: '{color.primary}', type: 'color' },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: { $value: '#1a73e8', $type: 'color' },
        alias: { $value: '{color.primary}', $type: 'color' },
      },
    });
  });

  it('preserves $extensions', () => {
    const input = {
      color: {
        primary: {
          value: '#1a73e8',
          $extensions: { 'com.figma': { exportKey: 'color' } },
        },
      },
    };
    const result = convertStyleDictionary(input);
    expect(result).toEqual({
      color: {
        primary: {
          $value: '#1a73e8',
          $extensions: { 'com.figma': { exportKey: 'color' } },
        },
      },
    });
  });

  it('throws on non-object input', () => {
    expect(() => convertStyleDictionary(null)).toThrow('must be a JSON object');
    expect(() => convertStyleDictionary('string')).toThrow('must be a JSON object');
    expect(() => convertStyleDictionary([1, 2])).toThrow('must be a JSON object');
  });

  it('throws on token missing value', () => {
    const input = { color: { primary: { value: undefined, type: 'color' } } };
    expect(() => convertStyleDictionary(input)).toThrow('missing a "value"');
  });

  it('throws on invalid type', () => {
    const input = { color: { primary: { value: '#000', type: 'invalid' } } };
    expect(() => convertStyleDictionary(input)).toThrow('unknown type');
  });

  it('output validates as W3C DTCG', () => {
    const input = {
      color: {
        $type: 'color',
        primary: { value: '#1a73e8', comment: 'Primary brand color' },
        secondary: { value: '#5f6368', comment: 'Secondary' },
      },
      spacing: {
        $type: 'dimension',
        small: { value: '8px' },
        medium: { value: '16px' },
      },
    };
    const result = convertStyleDictionary(input);
    const doc = parseTokenDocument(result);
    expect(doc.tokens.length).toBeGreaterThan(0);
  });

  it('output validates with references', () => {
    const input = {
      color: {
        $type: 'color',
        primary: { value: '#1a73e8' },
        alias: { value: '{color.primary}' },
      },
    };
    const result = convertStyleDictionary(input);
    const doc = parseTokenDocument(result);
    expect(doc.tokens).toHaveLength(2);
  });
});

describe('importStyleDictionary (integration)', () => {
  it('reads SD file and writes DTCG tokens.json', async () => {
    const inputPath = tmpFile('sd-input');
    await writeJson(inputPath, {
      color: {
        $type: 'color',
        primary: { value: '#1a73e8', comment: 'Primary brand color' },
        secondary: { value: '#5f6368' },
      },
      spacing: {
        $type: 'dimension',
        small: { value: '8px' },
      },
    });

    const dir = tmpDir('sd-output');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });

    const writtenPath = await importStyleDictionary({
      input: inputPath,
      output: dir,
    });

    expect(writtenPath).toBe(join(dir, 'tokens.json'));

    const { readFileSync } = await import('node:fs');
    const output = JSON.parse(readFileSync(writtenPath, 'utf8')) as Record<string, unknown>;
    const colorGroup = output.color as Record<string, Record<string, unknown>>;
    expect(colorGroup.primary).toEqual({
      $value: '#1a73e8',
      $description: 'Primary brand color',
    });
    expect(colorGroup.secondary).toEqual({
      $value: '#5f6368',
    });
  });

  it('defaults output to tokens.json in input directory', async () => {
    const dir = tmpDir('sd-default-out');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });

    const inputPath = join(dir, 'sd-tokens.json');
    await writeJson(inputPath, {
      color: { primary: { value: '#000', type: 'color' } },
    });

    const writtenPath = await importStyleDictionary({ input: inputPath });
    cleanup.push(writtenPath);

    expect(writtenPath).toBe(join(dir, 'tokens.json'));

    const { readFileSync, existsSync } = await import('node:fs');
    expect(existsSync(writtenPath)).toBe(true);
    const output = JSON.parse(readFileSync(writtenPath, 'utf8')) as Record<string, unknown>;
    expect(output.color).toBeDefined();
  });

  it('throws on invalid JSON file', async () => {
    const dir = tmpDir('sd-bad');
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });
    const badPath = join(dir, 'bad.json');
    await writeFile(badPath, 'not json!!!', 'utf8');

    await expect(importStyleDictionary({ input: badPath })).rejects.toThrow('Invalid JSON');
  });

  it('throws on non-existent file', async () => {
    await expect(importStyleDictionary({ input: '/nonexistent/path/tokens.json' })).rejects.toThrow(
      'Failed to read file',
    );
  });
});
