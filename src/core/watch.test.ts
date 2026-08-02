/**
 * Tests for the watch mode (`src/core/watch.ts`).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile as writeFileAsync, rm as rmAsync, mkdir as mkdirAsync } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import type { BuildResult } from './pipeline.js';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(arg: unknown) => void>>();
  const watcher = {
    on: vi.fn((event: string, handler: (arg: unknown) => void) => {
      let set = handlers.get(event);
      if (set === undefined) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return watcher;
    }),
    close: vi.fn(() => undefined),
  };
  return { handlers, watcher, watch: vi.fn(() => watcher) };
});

vi.mock('chokidar', () => ({ watch: mocks.watch }));

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

const cachedResult = (tokenCount: number): BuildResult => ({
  artifacts: [],
  tokenCount,
  formats: ['css'],
  cached: true,
});

const builtResult = (artifactCount: number, tokenCount: number): BuildResult => ({
  artifacts: Array.from({ length: artifactCount }, (_, i) => ({
    relativePath: `css/tokens-${i}.css`,
    content: 'x',
  })),
  tokenCount,
  formats: ['css'],
  cached: false,
});

const getHandler = (event: string): ((arg: unknown) => void) => {
  const fn = mocks.handlers.get(event)?.values().next().value;
  if (fn === undefined) throw new Error(`no ${event} handler registered`);
  return fn;
};

const getSignalHandler = (onCalls: Array<[string, () => void]>, signal: string): (() => void) => {
  const handler = onCalls.find(([event]) => event === signal)?.[1];
  if (handler === undefined) throw new Error(`no ${signal} handler registered`);
  return handler;
};

afterEach(async () => {
  for (const f of cleanup) {
    await rmAsync(f, { recursive: true, force: true });
  }
  cleanup.length = 0;
  mocks.handlers.clear();
  vi.useRealTimers();
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

describe('watch module — config & cache paths', () => {
  const writeThemeConfig = async (dir: string, outputDir: string, extra = ''): Promise<string> => {
    const lightPath = join(dir, 'light.json');
    const darkPath = join(dir, 'dark.json');
    await writeJson(lightPath, { color: { $type: 'color', primary: { $value: '#ffffff' } } });
    await writeJson(darkPath, { color: { $type: 'color', primary: { $value: '#000000' } } });
    const configPath = join(dir, 'toki.config.ts');
    const configContent = [
      'const config = {',
      '  input: ' + JSON.stringify(lightPath) + ',',
      '  output: ' + JSON.stringify(outputDir) + ',',
      "  formats: ['css'],",
      "  naming: { css: 'kebab-case' },",
      '  themes: {',
      '    light: ' + JSON.stringify(lightPath) + ',',
      '    dark: ' + JSON.stringify(darkPath) + ',',
      '  },',
      extra,
      '};',
      'export default config;',
    ].join('\n');
    await writeFileAsync(configPath, configContent, 'utf8');
    return configPath;
  };

  it('rejects with CONFIG_ERROR for an unknown theme', async () => {
    const dir = tmpDir('unknown-theme');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const outputDir = join(dir, 'output');
    const configPath = await writeThemeConfig(dir, outputDir);

    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    await expect(
      startWatch({
        format: ['css'],
        clean: false,
        cache: false,
        verbose: false,
        config: configPath,
        theme: 'nope',
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_ERROR', message: expect.stringContaining('Unknown theme "nope"') });
    onSpy.mockRestore();
  });

  it('prints verbose startup info', async () => {
    const dir = tmpDir('verbose');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const inputPath = join(dir, 'tokens.json');
    await writeJson(inputPath, SAMPLE_TOKENS);
    const outputDir = join(dir, 'output');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      input: inputPath,
      output: outputDir,
      format: ['css'],
      clean: true,
      cache: false,
      verbose: true,
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('toki watch v'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('watching:'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('formats: css'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('output:'));

    cleanupFn();
    onSpy.mockRestore();
  });

  it('reports a cached initial build for single input with config extras', async () => {
    const dir = tmpDir('cached-single');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const inputPath = join(dir, 'tokens.json');
    await writeJson(inputPath, SAMPLE_TOKENS);
    const outputDir = join(dir, 'output');
    const configPath = join(dir, 'toki.config.ts');
    const configContent = [
      'const config = {',
      '  input: ' + JSON.stringify(inputPath) + ',',
      '  output: ' + JSON.stringify(outputDir) + ',',
      "  formats: ['css'],",
      "  naming: { css: 'kebab-case' },",
      '  transforms: [],',
      '};',
      'export default config;',
    ].join('\n');
    await writeFileAsync(configPath, configContent, 'utf8');

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(cachedResult(1));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      input: inputPath,
      output: outputDir,
      format: ['css'],
      clean: true,
      cache: true,
      verbose: false,
      config: configPath,
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Initial build: up to date — 1 token cached'));

    cleanupFn();
    onSpy.mockRestore();
    spy.mockRestore();
  });

  it('accumulates cached counts across themes', async () => {
    const dir = tmpDir('cached-themes');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const outputDir = join(dir, 'output');
    const configPath = await writeThemeConfig(dir, outputDir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(cachedResult(3));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      output: outputDir,
      format: ['css'],
      clean: false,
      cache: true,
      verbose: false,
      config: configPath,
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Initial build: up to date — 6 tokens cached'));

    cleanupFn();
    onSpy.mockRestore();
    spy.mockRestore();
  });

  it('reports a cached initial build without a config file', async () => {
    const dir = tmpDir('cached-noconfig');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const inputPath = join(dir, 'tokens.json');
    await writeJson(inputPath, SAMPLE_TOKENS);
    const outputDir = join(dir, 'output');

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(cachedResult(2));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const { startWatch } = await import('./watch.js');
    const cleanupFn = await startWatch({
      input: inputPath,
      output: outputDir,
      format: ['css'],
      clean: true,
      cache: true,
      verbose: false,
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Initial build: up to date — 2 tokens cached'));

    cleanupFn();
    onSpy.mockRestore();
    spy.mockRestore();
  });

  it('reports a single-artifact initial build', async () => {
    const dir = tmpDir('single-artifact');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);
    const inputPath = join(dir, 'tokens.json');
    await writeJson(inputPath, SAMPLE_TOKENS);
    const outputDir = join(dir, 'output');

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(builtResult(1, 1));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Initial build: 1 artifact from 1 token'));

    cleanupFn();
    onSpy.mockRestore();
    spy.mockRestore();
  });
});

describe('watch module — watcher events', () => {
  const startWatching = async (
    pipelineSpy: ReturnType<typeof vi.spyOn>,
    dir: string,
    overrides: { input?: string; output?: string } = {},
  ): Promise<() => void> => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pipelineSpy.mockResolvedValue(builtResult(2, 2));
    const { startWatch } = await import('./watch.js');
    return startWatch({
      input: overrides.input ?? join(dir, 'tokens.json'),
      output: overrides.output ?? join(dir, 'output'),
      format: ['css'],
      clean: true,
      cache: false,
      verbose: false,
    });
  };

  it('debounces rapid changes into a single rebuild', async () => {
    const dir = tmpDir('debounce');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const cleanupFn = await startWatching(spy, dir);

    getHandler('change')('/tmp/a.json');
    getHandler('add')('/tmp/b.json');
    vi.advanceTimersByTime(200);
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Rebuilt 2 artifacts from 2 tokens'));
    });

    expect(spy).toHaveBeenCalledTimes(2); // initial build + single debounced rebuild
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('/tmp/b.json'));

    cleanupFn();
    onSpy.mockRestore();
  });

  it('prints "Up to date" when a rebuild hits the cache', async () => {
    const dir = tmpDir('cached-rebuild');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const cleanupFn = await startWatching(spy, dir);
    spy.mockResolvedValue(cachedResult(5));

    getHandler('change')('/tmp/a.json');
    await vi.advanceTimersByTimeAsync(200);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Up to date — 5 tokens cached, no changes'));

    spy.mockResolvedValue(cachedResult(1));
    getHandler('change')('/tmp/b.json');
    await vi.advanceTimersByTimeAsync(200);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Up to date — 1 token cached, no changes'));

    cleanupFn();
    onSpy.mockRestore();
  });

  it('reports build failures and recovers on the next change', async () => {
    const dir = tmpDir('build-fail');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const cleanupFn = await startWatching(spy, dir);
    spy.mockRejectedValueOnce(new Error('boom'));

    getHandler('change')('/tmp/a.json');
    await vi.advanceTimersByTimeAsync(200);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Build failed: boom'));

    spy.mockResolvedValue(builtResult(1, 1));
    getHandler('change')('/tmp/b.json');
    vi.advanceTimersByTime(200);
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Rebuilt 1 artifact from 1 token'));
    });

    cleanupFn();
    onSpy.mockRestore();
  });

  it('handles non-Error build failures', async () => {
    const dir = tmpDir('build-fail-string');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const cleanupFn = await startWatching(spy, dir);
    spy.mockRejectedValueOnce('string-boom' as never);

    getHandler('change')('/tmp/a.json');
    await vi.advanceTimersByTimeAsync(200);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Build failed: string-boom'));

    cleanupFn();
    onSpy.mockRestore();
  });

  it('skips rebuilds while a build is in flight', async () => {
    const dir = tmpDir('in-flight');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const cleanupFn = await startWatching(spy, dir);

    let resolveBuild: ((result: BuildResult) => void) | undefined;
    const deferred = new Promise<BuildResult>((resolve) => {
      resolveBuild = resolve;
    });
    spy.mockImplementation(() => deferred);

    getHandler('change')('/tmp/a.json');
    vi.advanceTimersByTime(200); // starts the build; suspends on the deferred
    getHandler('change')('/tmp/b.json'); // building === true → skipped, no timer scheduled
    expect(vi.getTimerCount()).toBe(0);

    resolveBuild?.(builtResult(2, 2));
    await vi.waitFor(async () => {
      getHandler('change')('/tmp/c.json');
      vi.advanceTimersByTime(200);
      expect(spy).toHaveBeenCalledTimes(3); // initial + first rebuild + post-skip rebuild
    });
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledTimes(4); // initial + watching + both rebuilds completed
    });

    cleanupFn();
    onSpy.mockRestore();
  });

  it('logs watcher errors', async () => {
    const dir = tmpDir('watcher-error');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const cleanupFn = await startWatching(spy, dir);

    getHandler('error')(new Error('wboom'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Watcher error: wboom'));

    getHandler('error')('raw-error');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Watcher error: raw-error'));

    cleanupFn();
    onSpy.mockRestore();
  });

  it('cleans up the watcher and exits on SIGINT and SIGTERM', async () => {
    const dir = tmpDir('signals');
    await mkdirAsync(dir, { recursive: true });
    cleanup.push(dir);

    const pipeline = await import('./pipeline.js');
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cleanupFn = await startWatching(spy, dir);

    getHandler('change')('/tmp/a.json'); // leave a pending debounce timer for cleanup to clear

    const calls = onSpy.mock.calls as unknown as Array<[string, () => void]>;
    getSignalHandler(calls, 'SIGINT')();
    getSignalHandler(calls, 'SIGTERM')();

    expect(mocks.watcher.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(exitSpy).toHaveBeenCalledTimes(2);

    cleanupFn();
    logSpy.mockRestore();
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
