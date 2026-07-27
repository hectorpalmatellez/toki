import { readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { extractCssProperties, type ExtractedToken } from './css-properties.js';
import { extractScssVariables } from './scss-variables.js';

export type { ExtractedToken } from './css-properties.js';

export interface ScanOptions {
  readonly path: string;
  readonly extensions?: readonly string[];
}

export interface ScanResult {
  readonly tokens: readonly ExtractedToken[];
  readonly sources: readonly string[];
  readonly errors: ReadonlyArray<{ readonly file: string; readonly message: string }>;
}

const DEFAULT_EXTENSIONS = ['.css', '.scss'] as const;

const extractorForExtension = (
  ext: string,
): ((content: string, source: string) => readonly ExtractedToken[]) | undefined => {
  switch (ext.toLowerCase()) {
    case '.css':
      return extractCssProperties;
    case '.scss':
      return extractScssVariables;
    default:
      return undefined;
  }
};

const extractFromFile = async (
  filePath: string,
  basePath: string,
): Promise<{ tokens: readonly ExtractedToken[]; error?: { file: string; message: string } }> => {
  const ext = extname(filePath);
  const extractor = extractorForExtension(ext);
  if (extractor === undefined) {
    return { tokens: [] };
  }

  try {
    const content = await readFile(filePath, 'utf8');
    const relSource = relative(basePath, filePath) || filePath;
    return { tokens: extractor(content, relSource) };
  } catch (error) {
    return {
      tokens: [],
      error: { file: filePath, message: error instanceof Error ? error.message : String(error) },
    };
  }
};

export const scanFiles = async (options: ScanOptions): Promise<ScanResult> => {
  const basePath = resolve(options.path);
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));
  const allTokens: ExtractedToken[] = [];
  const sources: string[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  const pathStat = await stat(basePath).catch(() => undefined);
  if (pathStat === undefined) {
    return { tokens: [], sources: [], errors: [{ file: basePath, message: 'Path does not exist' }] };
  }

  if (pathStat.isFile()) {
    const ext = extname(basePath).toLowerCase();
    if (extSet.has(ext)) {
      const result = await extractFromFile(basePath, basePath);
      allTokens.push(...result.tokens);
      if (result.error !== undefined) errors.push(result.error);
      if (result.tokens.length > 0) sources.push(basePath);
    }
    return { tokens: allTokens, sources, errors };
  }

  if (!pathStat.isDirectory()) {
    return { tokens: [], sources: [], errors: [{ file: basePath, message: 'Path is not a file or directory' }] };
  }

  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(basePath, { recursive: true, withFileTypes: false });

  const filesToProcess: string[] = [];
  for (const entry of entries) {
    const entryPath = resolve(basePath, entry as string);
    const ext = extname(entry as string).toLowerCase();
    if (extSet.has(ext)) {
      filesToProcess.push(entryPath);
    }
  }

  filesToProcess.sort();

  for (const filePath of filesToProcess) {
    const fileStat = await stat(filePath).catch(() => undefined);
    if (fileStat === undefined || !fileStat.isFile()) continue;

    const result = await extractFromFile(filePath, basePath);
    allTokens.push(...result.tokens);
    if (result.error !== undefined) errors.push(result.error);
    if (result.tokens.length > 0) {
      sources.push(relative(basePath, filePath) || filePath);
    }
  }

  return { tokens: allTokens, sources, errors };
};
