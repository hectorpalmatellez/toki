import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanFiles } from '../scanner.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const uniqueDir = async (): Promise<string> => {
  const dir = join(tmpdir(), `toki-extractor-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

let testDir: string;

beforeAll(async () => {
  testDir = await uniqueDir();
  await mkdir(join(testDir, 'styles'), { recursive: true });
  await mkdir(join(testDir, 'components'), { recursive: true });

  await writeFile(
    join(testDir, 'styles', 'variables.css'),
    `:root {\n  --color-primary: #1a73e8;\n  --spacing-md: 16px;\n}\n`,
    'utf8',
  );

  await writeFile(
    join(testDir, 'styles', '_theme.scss'),
    `$color-secondary: #5f6368;\n$font-size-base: 1rem;\n`,
    'utf8',
  );

  await writeFile(
    join(testDir, 'components', 'button.css'),
    `.btn { --btn-color: coral; }\n`,
    'utf8',
  );

  await writeFile(join(testDir, 'readme.txt'), 'not a style file\n', 'utf8');
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('scanFiles', () => {
  it('scans a directory and extracts tokens from CSS and SCSS files', async () => {
    const result = await scanFiles({ path: testDir });
    expect(result.tokens.length).toBe(5);
    expect(result.sources.length).toBe(3);
    expect(result.errors.length).toBe(0);
    const ids = result.tokens.map((t) => t.id);
    expect(ids).toContain('color-primary');
    expect(ids).toContain('spacing-md');
    expect(ids).toContain('color-secondary');
    expect(ids).toContain('font-size-base');
    expect(ids).toContain('btn-color');
  });

  it('scans a single CSS file', async () => {
    const result = await scanFiles({ path: join(testDir, 'styles', 'variables.css') });
    expect(result.tokens.length).toBe(2);
    expect(result.sources.length).toBe(1);
  });

  it('scans a single SCSS file', async () => {
    const result = await scanFiles({ path: join(testDir, 'styles', '_theme.scss') });
    expect(result.tokens.length).toBe(2);
    expect(result.sources.length).toBe(1);
  });

  it('returns empty for a non-style file', async () => {
    const result = await scanFiles({ path: join(testDir, 'readme.txt') });
    expect(result.tokens.length).toBe(0);
  });

  it('returns error for non-existent path', async () => {
    const result = await scanFiles({ path: join(testDir, 'nonexistent') });
    expect(result.tokens.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.message).toContain('does not exist');
  });

  it('respects custom extensions filter', async () => {
    const result = await scanFiles({ path: testDir, extensions: ['.css'] });
    expect(result.tokens.length).toBe(3);
    const ids = result.tokens.map((t) => t.id);
    expect(ids).not.toContain('color-secondary');
  });

  it('does not include files with zero tokens in sources', async () => {
    const emptyDir = await uniqueDir();
    await writeFile(join(emptyDir, 'empty.css'), '/* nothing here */\n', 'utf8');
    const result = await scanFiles({ path: emptyDir });
    expect(result.tokens.length).toBe(0);
    expect(result.sources.length).toBe(0);
    await rm(emptyDir, { recursive: true, force: true });
  });
});
