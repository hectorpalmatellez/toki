import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildCommand = vi.fn();
const mockStartWatch = vi.fn();
const mockRunDiff = vi.fn();
const mockFormatDiffTerminal = vi.fn();
const mockFormatDiffJson = vi.fn();
const mockImportStyleDictionary = vi.fn();
const mockImportFigmaTokens = vi.fn();
const mockExistsSync = vi.fn();
const mockWriteFileSync = vi.fn();

const promptQueue: unknown[] = [];

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(async () => promptQueue.shift()),
  multiselect: vi.fn(async () => promptQueue.shift()),
  text: vi.fn(async () => promptQueue.shift()),
  confirm: vi.fn(async () => promptQueue.shift()),
  isCancel: vi.fn((val: unknown) => val === '__CANCEL__'),
  cancel: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('./cli.js', () => ({
  buildCommand: (...args: unknown[]) => mockBuildCommand(...args),
}));

vi.mock('./core/watch.js', () => ({
  startWatch: (...args: unknown[]) => mockStartWatch(...args),
}));

vi.mock('./core/diff.js', () => ({
  runDiff: (...args: unknown[]) => mockRunDiff(...args),
  formatDiffTerminal: (...args: unknown[]) => mockFormatDiffTerminal(...args),
  formatDiffJson: (...args: unknown[]) => mockFormatDiffJson(...args),
}));

vi.mock('./importers/style-dictionary.js', () => ({
  importStyleDictionary: (...args: unknown[]) => mockImportStyleDictionary(...args),
}));

vi.mock('./importers/figma-tokens.js', () => ({
  importFigmaTokens: (...args: unknown[]) => mockImportFigmaTokens(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

const enqueue = (...values: unknown[]) => {
  promptQueue.push(...values);
};

import { runTui } from './tui.js';

describe('tui — runTui', () => {
  beforeEach(() => {
    promptQueue.length = 0;
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();

    mockBuildCommand.mockReset().mockResolvedValue(undefined);
    mockStartWatch.mockReset().mockResolvedValue(vi.fn());
    mockRunDiff.mockReset().mockResolvedValue({ added: [], removed: [], changed: [] });
    mockFormatDiffTerminal.mockReset().mockReturnValue('diff output');
    mockFormatDiffJson.mockReset().mockReturnValue({ added: [], removed: [], changed: [] });
    mockImportStyleDictionary.mockReset().mockResolvedValue('/out/sd-tokens.json');
    mockImportFigmaTokens.mockReset().mockResolvedValue('/out/figma-tokens.json');
    mockExistsSync.mockReset().mockReturnValue(false);
    mockWriteFileSync.mockReset();
  });

  it('init: scaffolds tokens.json and toki.config.ts', async () => {
    enqueue('init', './my-project');

    await runTui();

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('tokens.json'),
      expect.stringContaining('"primary"'),
      'utf8',
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('toki.config.ts'),
      expect.stringContaining('TokiConfig'),
      'utf8',
    );
  });

  it('init: does not overwrite existing files', async () => {
    mockExistsSync.mockReturnValue(true);
    enqueue('init', './my-project');

    await runTui();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('init: uses cwd when dir input is empty', async () => {
    enqueue('init', '  ');

    await runTui();

    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('tokens.json'), expect.any(String), 'utf8');
  });

  it('diff: outputs terminal format by default', async () => {
    mockRunDiff.mockResolvedValue({
      added: [{ id: 'color.accent' }],
      removed: [],
      changed: [],
    });
    enqueue('diff', 'old.json', 'new.json', false);

    await runTui();

    expect(mockRunDiff).toHaveBeenCalledWith('old.json', 'new.json');
    expect(mockFormatDiffTerminal).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1 difference'));
  });

  it('diff: outputs JSON format when requested', async () => {
    enqueue('diff', 'old.json', 'new.json', true);

    await runTui();

    expect(mockFormatDiffJson).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String));
  });

  it('diff: shows plural "differences" for multiple changes', async () => {
    mockRunDiff.mockResolvedValue({
      added: [{ id: 'a' }],
      removed: [{ id: 'b' }],
      changed: [{ id: 'c' }],
    });
    enqueue('diff', 'old.json', 'new.json', false);

    await runTui();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('3 differences'));
  });

  it('diff: does not show count when no differences', async () => {
    mockRunDiff.mockResolvedValue({ added: [], removed: [], changed: [] });
    enqueue('diff', 'old.json', 'new.json', false);

    await runTui();

    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('difference'));
  });

  it('diff: handles errors', async () => {
    mockRunDiff.mockRejectedValue(new Error('file not found'));
    enqueue('diff', 'missing.json', 'new.json', false);

    await runTui();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('file not found'));
  });

  it('watch: starts file watcher with selected formats', async () => {
    enqueue('watch', ['css', 'js'], false);

    await runTui();

    expect(mockStartWatch).toHaveBeenCalledWith({
      format: ['css', 'js'],
      clean: true,
      cache: true,
      verbose: false,
    });
  });

  it('watch: passes verbose flag', async () => {
    enqueue('watch', ['css'], true);

    await runTui();

    expect(mockStartWatch).toHaveBeenCalledWith({
      format: ['css'],
      clean: true,
      cache: true,
      verbose: true,
    });
  });

  it('watch: handles errors', async () => {
    mockStartWatch.mockRejectedValue(new Error('watch failed'));
    enqueue('watch', ['css'], false);

    await runTui();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('watch failed'));
  });

  it('import: imports from Style Dictionary', async () => {
    enqueue('import', 'style-dictionary', 'sd-config.json');

    await runTui();

    expect(mockImportStyleDictionary).toHaveBeenCalledWith({ input: 'sd-config.json' });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('/out/sd-tokens.json'));
  });

  it('import: imports from Figma Tokens', async () => {
    enqueue('import', 'figma-tokens', 'figma.json');

    await runTui();

    expect(mockImportFigmaTokens).toHaveBeenCalledWith({ input: 'figma.json' });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('/out/figma-tokens.json'));
  });

  it('import: handles errors', async () => {
    mockImportStyleDictionary.mockRejectedValue(new Error('import failed'));
    enqueue('import', 'style-dictionary', 'bad.json');

    await runTui();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('import failed'));
  });

  it('build: runs buildCommand with selected options', async () => {
    enqueue('build', 'tokens.json', './dist', ['css', 'js'], false);

    await runTui();

    expect(mockBuildCommand).toHaveBeenCalledWith({
      input: 'tokens.json',
      output: './dist',
      format: ['css', 'js'],
      formatProvided: true,
      clean: true,
      cache: true,
      verbose: false,
    });
  });

  it('build: passes verbose flag', async () => {
    enqueue('build', 'tokens.json', './dist', ['css'], true);

    await runTui();

    expect(mockBuildCommand).toHaveBeenCalledWith({
      input: 'tokens.json',
      output: './dist',
      format: ['css'],
      formatProvided: true,
      clean: true,
      cache: true,
      verbose: true,
    });
  });

  it('build: handles errors', async () => {
    mockBuildCommand.mockRejectedValue(new Error('build failed'));
    enqueue('build', 'tokens.json', './dist', ['css'], false);

    await runTui();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('build failed'));
  });

  it('exits early when command selection is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockBuildCommand).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when init dir input is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('init', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when diff old path is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('diff', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockRunDiff).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when diff new path is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('diff', 'old.json', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockRunDiff).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when diff json confirm is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('diff', 'old.json', 'new.json', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockRunDiff).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when watch formats are cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('watch', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockStartWatch).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when watch verbose is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('watch', ['css'], '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockStartWatch).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when import format is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('import', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockImportStyleDictionary).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when import input path is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('import', 'style-dictionary', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockImportStyleDictionary).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when build input is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('build', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockBuildCommand).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when build output is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('build', 'tokens.json', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockBuildCommand).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when build formats are cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('build', 'tokens.json', './dist', '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockBuildCommand).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early when build verbose is cancelled', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('__EXIT__');
    }) as never);
    enqueue('build', 'tokens.json', './dist', ['css'], '__CANCEL__');

    await expect(runTui()).rejects.toThrow('__EXIT__');
    expect(mockBuildCommand).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });
});
