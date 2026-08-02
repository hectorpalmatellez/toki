import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCompletionFiles } from './generate.js';
import type { CompletionSpec } from './spec.js';

const SAMPLE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
  },
  spacing: { $type: 'dimension', small: { $value: '8px' } },
};

let samplePath: string | undefined;

const sampleFile = async (): Promise<string> => {
  if (samplePath === undefined) {
    samplePath = join(await mkdtemp(join(tmpdir(), 'toki-completions-sample-')), 'tokens.json');
    await writeFile(samplePath, JSON.stringify(SAMPLE), 'utf8');
  }
  return samplePath;
};

describe('writeCompletionFiles', () => {
  it('writes the spec, VS Code snippets, and LSP document by default', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toki-completions-'));
    const written = await writeCompletionFiles({ input: await sampleFile(), output: dir });
    expect(written.toSorted()).toEqual(['spec.json', 'tokens.code-snippets', 'tokens.lsp.json']);

    const spec = JSON.parse(await readFile(join(dir, 'spec.json'), 'utf8')) as CompletionSpec;
    expect(spec.version).toBe(1);
    expect(spec.tokens.map((token) => token.id)).toEqual(['color.primary', 'spacing.small']);

    const snippets = JSON.parse(await readFile(join(dir, 'tokens.code-snippets'), 'utf8')) as Record<string, unknown>;
    expect(snippets['color.primary']).toBeDefined();

    const lsp = JSON.parse(await readFile(join(dir, 'tokens.lsp.json'), 'utf8')) as {
      completions: readonly unknown[];
    };
    expect(lsp.completions).toHaveLength(2);
  });

  it('writes only the requested editor targets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toki-completions-'));
    const written = await writeCompletionFiles({ input: await sampleFile(), output: dir, editors: ['vscode'] });
    expect(written).toEqual(['tokens.code-snippets']);
  });

  it('applies a theme suffix to every file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toki-completions-'));
    const written = await writeCompletionFiles({ input: await sampleFile(), output: dir, theme: 'dark' });
    expect(written.toSorted()).toEqual(['spec.dark.json', 'tokens.dark.code-snippets', 'tokens.dark.lsp.json']);
  });

  it('produces deterministic output', async () => {
    const a = await mkdtemp(join(tmpdir(), 'toki-completions-'));
    const b = await mkdtemp(join(tmpdir(), 'toki-completions-'));
    const input = await sampleFile();
    await writeCompletionFiles({ input, output: a });
    await writeCompletionFiles({ input, output: b });
    expect(await readFile(join(a, 'spec.json'), 'utf8')).toBe(await readFile(join(b, 'spec.json'), 'utf8'));
  });
});
