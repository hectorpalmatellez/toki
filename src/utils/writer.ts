/**
 * Writer: persists {@link OutputArtifact}s to disk under an output directory.
 *
 * `--clean` semantics: only the platform subdirectories we are about to write
 * are removed (e.g. `output/css`, `output/js`), never arbitrary user files
 * living under the output root. Files are written UTF-8 with a trailing
 * newline for cross-platform determinism.
 */

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import type { OutputArtifact } from '../core/types.js';
import { IoError } from './errors.js';

export interface WriteResult {
  readonly written: readonly string[];
}

/** Ensure the output directory exists, creating it if missing. Returns true if it was created. */
export const ensureOutputDir = async (outputDir: string): Promise<boolean> => {
  if (existsSync(outputDir)) return false;
  await mkdir(outputDir, { recursive: true });
  return true;
};

const firstSegment = (relativePath: string): string => {
  const [head] = normalize(relativePath).split('/');
  if (head === undefined) return relativePath;
  return head;
};

/** Write artifacts under `outputDir`. Returns the list of absolute paths. */
export const writeArtifacts = async (
  outputDir: string,
  artifacts: readonly OutputArtifact[],
  options: { clean?: boolean } = {},
): Promise<WriteResult> => {
  // Determine the top-level subdirectories we will write into.
  const subdirs = new Set<string>();
  for (const artifact of artifacts) {
    subdirs.add(firstSegment(artifact.relativePath));
  }

  if (options.clean) {
    for (const sub of subdirs) {
      const target = join(outputDir, sub);
      try {
        await rm(target, { recursive: true, force: true });
      } catch (cause) {
        throw new IoError(`Failed to clean ${target}`, cause);
      }
    }
  }

  const mkdirs = new Map<string, Promise<void>>();
  const ensureDir = (dir: string): Promise<void> => {
    const existing = mkdirs.get(dir);
    if (existing !== undefined) return existing;
    const p = mkdir(dir, { recursive: true }).then(() => {});
    mkdirs.set(dir, p);
    return p;
  };

  const writes = artifacts.map(async (artifact) => {
    const absPath = join(outputDir, normalize(artifact.relativePath));
    await ensureDir(dirname(absPath));
    try {
      await writeFile(absPath, `${artifact.content}\n`, 'utf8');
    } catch (cause) {
      throw new IoError(`Failed to write ${absPath}`, cause);
    }
    return absPath;
  });

  const written = await Promise.all(writes);
  return { written };
};
