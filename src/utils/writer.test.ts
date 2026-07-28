import { describe, it, expect } from 'vitest';
import { writeArtifacts } from './writer.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { OutputArtifact } from '../core/types.js';

const uniqueDir = async (): Promise<string> => {
  const dir = join(tmpdir(), `toki-writer-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

const makeArtifact = (relativePath: string, content = 'content'): OutputArtifact => ({
  relativePath,
  format: 'css',
  content,
});

describe('writeArtifacts', () => {
  it('writes all artifacts and returns absolute paths', async () => {
    const outputDir = await uniqueDir();
    const artifacts = [
      makeArtifact('css/tokens.css', ':root { --color: #fff; }'),
      makeArtifact('js/tokens.js', 'export const color = "#fff";'),
      makeArtifact('js/tokens.d.ts', 'export const color: string;'),
    ];

    const result = await writeArtifacts(outputDir, artifacts);
    expect(result.written.length).toBe(3);

    const cssContent = await readFile(join(outputDir, 'css', 'tokens.css'), 'utf8');
    expect(cssContent).toBe(':root { --color: #fff; }\n');

    const jsContent = await readFile(join(outputDir, 'js', 'tokens.js'), 'utf8');
    expect(jsContent).toBe('export const color = "#fff";\n');
  });

  it('writes many artifacts to the same directory concurrently', async () => {
    const outputDir = await uniqueDir();
    const count = 50;
    const artifacts: OutputArtifact[] = Array.from({ length: count }, (_, i) =>
      makeArtifact(`css/token-${String(i).padStart(3, '0')}.css`, `--token-${i}: ${i}px;`),
    );

    const result = await writeArtifacts(outputDir, artifacts);
    expect(result.written.length).toBe(count);

    for (let i = 0; i < count; i++) {
      const content = await readFile(
        join(outputDir, 'css', `token-${String(i).padStart(3, '0')}.css`),
        'utf8',
      );
      expect(content).toBe(`--token-${i}: ${i}px;\n`);
    }
  });

  it('deduplicates concurrent mkdir calls for the same directory', async () => {
    const outputDir = await uniqueDir();
    const artifacts: OutputArtifact[] = Array.from({ length: 20 }, (_, i) =>
      makeArtifact(`shared/file-${i}.css`, `content-${i}`),
    );

    const result = await writeArtifacts(outputDir, artifacts);
    expect(result.written.length).toBe(20);
  });

  it('propagates IoError when a write fails', async () => {
    const outputDir = await uniqueDir();
    const goodArtifact = makeArtifact('ok/file.css', 'ok');
    const badArtifact: OutputArtifact = {
      relativePath: `${outputDir}/deep/nested/file.css`,
      format: 'css',
      get content(): string {
        throw new Error('simulated content error');
      },
    };

    await expect(writeArtifacts(outputDir, [goodArtifact, badArtifact])).rejects.toThrow();
  });

  it('clean option removes only targeted subdirectories', async () => {
    const outputDir = await uniqueDir();
    await mkdir(join(outputDir, 'css'), { recursive: true });
    await mkdir(join(outputDir, 'keep'), { recursive: true });
    await writeFile(join(outputDir, 'keep', 'data.txt'), 'persist', 'utf8');
    await writeFile(join(outputDir, 'css', 'old.css'), 'old', 'utf8');

    const artifacts = [makeArtifact('css/tokens.css', 'new')];
    await writeArtifacts(outputDir, artifacts, { clean: true });

    const kept = await readFile(join(outputDir, 'keep', 'data.txt'), 'utf8');
    expect(kept).toBe('persist');

    const cssContent = await readFile(join(outputDir, 'css', 'tokens.css'), 'utf8');
    expect(cssContent).toBe('new\n');
  });
});
