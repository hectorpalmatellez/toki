/**
 * Tests for the watch mode (`src/core/watch.ts`).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile as writeFileAsync, rm as rmAsync, mkdir as mkdirAsync } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';

const tmpDir = (name: string): string => join(tmpdir(), `toki-watch-test-${name}`);
const cleanup: string[] = [];

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFileAsync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const SAMPLE_TOKENS = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8' },
    secondary: { $value: '#5f6368' },
  },
};

afterEach(async () => {
  for (const f of cleanup) {
    await rmAsync(f, { recursive: true, force: true });
  }
  cleanup.length = 0;
  vi.restoreAllMocks();
});

describe('watch module', () => {
  it('exports startWatch function', async () => {
    const { startWatch } = await import('./watch.js');
    expect(typeof startWatch).toBe('function');
  });

  it('startWatch returns a cleanup function', async () => {
    const dir = tmpDir('cleanup-test');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const inputPath = join(dir, 'tokens.json');
    await writeJson(inputPath, SAMPLE_TOKENS);

    const outputDir = join(dir, 'output');
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      input: inputPath,
      output: outputDir,
      format: ['css', 'js'],
      clean: true,
      cache: false,
      verbose: false,
    });

    expect(typeof cleanupFn).toBe('function');
    cleanupFn();
    onSpy.mockRestore();
  });

  it('initial build creates output artifacts', async () => {
    const dir = tmpDir('initial-build');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const inputPath = join(dir, 'tokens.json');
    await writeJson(inputPath, SAMPLE_TOKENS);

    const outputDir = join(dir, 'output');
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      input: inputPath,
      output: outputDir,
      format: ['css'],
      clean: true,
      cache: false,
      verbose: false,
    });

    // Check that the output was written
    const cssDir = join(outputDir, 'css');
    expect(existsSync(cssDir)).toBe(true);
    const files = readdirSync(cssDir);
    expect(files.some((f) => String(f).endsWith('.css'))).toBe(true);

    cleanupFn();
    onSpy.mockRestore();
  });

  it('handles multi-theme configs', async () => {
    const dir = tmpDir('multi-theme');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const lightPath = join(dir, 'light.json');
    const darkPath = join(dir, 'dark.json');
    await writeJson(lightPath, { color: { $type: 'color', primary: { $value: '#ffffff' } } });
    await writeJson(darkPath, { color: { $type: 'color', primary: { $value: '#000000' } } });

    const outputDir = join(dir, 'output');

    const configContent = [
      'const config = {',
      '  input: ' + JSON.stringify(lightPath) + ',',
      '  output: ' + JSON.stringify(outputDir) + ',',
      "  formats: ['css'],",
      '  themes: {',
      '    light: ' + JSON.stringify(lightPath) + ',',
      '    dark: ' + JSON.stringify(darkPath) + ',',
      '  },',
      '};',
      'export default config;',
    ].join('\n');

    const configPath = join(dir, 'toki.config.ts');
    await writeFileAsync(configPath, configContent, 'utf8');

    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      output: outputDir,
      format: ['css'],
      clean: false,
      cache: false,
      verbose: false,
      config: configPath,
    });

    // Check that both themes were built
    expect(existsSync(join(outputDir, 'css', 'tokens.light.css'))).toBe(true);
    expect(existsSync(join(outputDir, 'css', 'tokens.dark.css'))).toBe(true);

    cleanupFn();
    onSpy.mockRestore();
  });
});
