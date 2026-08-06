/**
 * `toki ui` API handlers: project state, token read/write, build, and
 * validation over HTTP. All handlers are pure functions of a `UiContext`
 * (the working directory the server runs in) plus the request body.
 *
 * The UI manages exactly one file — `tokens.json` in the working directory.
 * Everything else (formats, output directory) is resolved from, in order:
 * request body → `.toki/ui.json` preferences → `toki.config.ts` → defaults.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { OutputFormat, TokiConfig } from '../core/types.js';
import { parseTokenDocument, parseTokenJson } from '../core/parser.js';
import { runPipeline } from '../core/pipeline.js';
import { writeArtifacts, ensureOutputDir } from '../utils/writer.js';
import { loadConfig, discoverConfig } from '../core/config.js';
import { implementedFormats, parseFormats } from '../generators/index.js';
import { validateTokens } from '../core/validate.js';
import { TokiError } from '../utils/errors.js';

export interface UiContext {
  /** Working directory the editor operates on. */
  readonly cwd: string;
  readonly verbose?: boolean;
  readonly log?: (msg: string) => void;
}

export interface UiPrefs {
  formats?: readonly string[];
  output?: string;
}

export interface BuildArtifactInfo {
  readonly relativePath: string;
  readonly format: string;
  readonly content: string;
}

export interface BuildResponse {
  readonly output: string;
  readonly formats: readonly string[];
  readonly tokenCount: number;
  readonly artifacts: readonly BuildArtifactInfo[];
}

export const TOKENS_FILENAME = 'tokens.json';

const SAMPLE_TOKENS: Record<string, unknown> = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
    secondary: { $value: '#5f6368', $description: 'Secondary text color' },
    background: { $value: '#ffffff', $description: 'Page background' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
    medium: { $value: '16px' },
    large: { $value: '24px' },
    xlarge: { $value: '32px' },
  },
  typography: {
    heading: {
      $type: 'typography',
      heading1: {
        $value: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '32px',
          fontWeight: '700',
          lineHeight: '1.2',
        },
        $description: 'Main heading style',
      },
      heading2: {
        $value: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '24px',
          fontWeight: '600',
          lineHeight: '1.3',
        },
        $description: 'Subheading style',
      },
    },
    body: {
      $type: 'typography',
      paragraph: {
        $value: {
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '1.5',
        },
        $description: 'Body text style',
      },
    },
  },
};

export const tokensPath = (ctx: UiContext): string => join(ctx.cwd, TOKENS_FILENAME);

const prefsPath = (ctx: UiContext): string => join(ctx.cwd, '.toki', 'ui.json');

const loadConfigFor = (ctx: UiContext): TokiConfig | undefined => {
  const configPath = discoverConfig(ctx.cwd);
  if (configPath === undefined) return undefined;
  return loadConfig(configPath);
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((entry): entry is string => typeof entry === 'string');
  return out;
};

export const loadPrefs = (ctx: UiContext): UiPrefs => {
  try {
    const raw = JSON.parse(readFileSync(prefsPath(ctx), 'utf8')) as Record<string, unknown>;
    const prefs: UiPrefs = {};
    const formats = asStringArray(raw['formats'])?.filter((f) =>
      (implementedFormats() as readonly string[]).includes(f),
    );
    if (formats !== undefined && formats.length > 0) prefs.formats = formats;
    if (typeof raw['output'] === 'string' && raw['output'].length > 0) prefs.output = raw['output'];
    return prefs;
  } catch {
    return {};
  }
};

export const savePrefs = (ctx: UiContext, prefs: UiPrefs): void => {
  try {
    mkdirSync(join(ctx.cwd, '.toki'), { recursive: true });
    writeFileSync(prefsPath(ctx), JSON.stringify(prefs, null, 2) + '\n', 'utf8');
  } catch {
    // Preferences are best-effort — never block the UI on a write failure.
  }
};

const parseFormatsFrom = (
  requested: unknown,
  prefs: UiPrefs,
  config: TokiConfig | undefined,
): readonly OutputFormat[] => {
  const source = asStringArray(requested) ?? prefs.formats ?? config?.formats ?? ['css', 'js'];
  const known = source.filter((f) => (implementedFormats() as readonly string[]).includes(f));
  if (known.length === 0) return ['css', 'js'];
  return parseFormats(known);
};

const resolveOutput = (requested: unknown, prefs: UiPrefs, config: TokiConfig | undefined): string => {
  const candidate = typeof requested === 'string' && requested.length > 0 ? requested : prefs.output;
  return candidate ?? config?.output ?? './dist';
};

/** Run a full pipeline build over the UI-managed tokens.json. */
export const runBuild = async (
  ctx: UiContext,
  requested: { formats?: unknown; output?: unknown } = {},
): Promise<BuildResponse> => {
  const input = tokensPath(ctx);
  if (!existsSync(input)) {
    throw new TokiError(`No ${TOKENS_FILENAME} found in ${ctx.cwd} — create and save tokens first.`, 'IO_ERROR');
  }
  const config = loadConfigFor(ctx);
  const prefs = loadPrefs(ctx);
  const formats = parseFormatsFrom(requested.formats, prefs, config);
  const output = resolveOutput(requested.output, prefs, config);

  const result = await runPipeline({
    input,
    formats,
    ...(config?.naming !== undefined ? { naming: config.naming } : {}),
    ...(config?.transforms !== undefined && config.transforms.length > 0 ? { transforms: config.transforms } : {}),
  });
  const outputDir = resolve(join(ctx.cwd, output));
  if (await ensureOutputDir(outputDir)) {
    ctx.log?.(`created output directory: ${outputDir}`);
  }
  const writeResult = await writeArtifacts(outputDir, result.artifacts, {
    clean: config?.clean ?? true,
  });

  ctx.log?.(`built ${writeResult.written.length} artifact(s) → ${outputDir}`);

  return {
    output,
    formats,
    tokenCount: result.tokenCount,
    artifacts: result.artifacts.map((artifact) => ({
      relativePath: artifact.relativePath,
      format: artifact.format,
      content: artifact.content,
    })),
  };
};

export const stateHandler = (ctx: UiContext): Record<string, unknown> => {
  const config = loadConfigFor(ctx);
  const prefs = loadPrefs(ctx);
  const state: Record<string, unknown> = {
    cwd: ctx.cwd,
    hasTokens: existsSync(tokensPath(ctx)),
    hasConfig: config !== undefined,
    formats: implementedFormats(),
    prefs,
  };
  if (config !== undefined) {
    state['configOutput'] = config.output;
    if (config.formats !== undefined) state['configFormats'] = config.formats;
  }
  return state;
};

export const tokensGetHandler = (ctx: UiContext): { status: number; body: unknown } => {
  const path = tokensPath(ctx);
  if (!existsSync(path)) {
    return { status: 200, body: { path, exists: false, tokens: null, sample: SAMPLE_TOKENS } };
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const tokens = parseTokenJson(raw, path);
    return { status: 200, body: { path, exists: true, tokens } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 200, body: { path, exists: true, tokens: null, error: message } };
  }
};

export const tokensPutHandler = async (
  ctx: UiContext,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> => {
  const tokens = body['tokens'];
  const path = tokensPath(ctx);
  try {
    parseTokenDocument(tokens, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 400, body: { ok: false, error: message } };
  }

  writeFileSync(path, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
  ctx.log?.(`wrote ${path}`);

  if (body['formats'] !== undefined || body['output'] !== undefined) {
    const prefs = loadPrefs(ctx);
    const nextPrefs: UiPrefs = { ...prefs };
    const formats = asStringArray(body['formats']);
    if (formats !== undefined && formats.length > 0) nextPrefs.formats = formats;
    if (typeof body['output'] === 'string' && body['output'].length > 0) nextPrefs.output = body['output'];
    savePrefs(ctx, nextPrefs);
  }

  const report = await validateTokens(path);
  const build = await runBuild(ctx, { formats: body['formats'], output: body['output'] });
  return { status: 200, body: { ok: true, issues: report.issues, build } };
};

export const buildHandler = async (
  ctx: UiContext,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> => {
  if (body['formats'] !== undefined || body['output'] !== undefined) {
    const prefs = loadPrefs(ctx);
    const nextPrefs: UiPrefs = { ...prefs };
    const formats = asStringArray(body['formats']);
    if (formats !== undefined && formats.length > 0) nextPrefs.formats = formats;
    if (typeof body['output'] === 'string' && body['output'].length > 0) nextPrefs.output = body['output'];
    savePrefs(ctx, nextPrefs);
  }
  try {
    const build = await runBuild(ctx, { formats: body['formats'], output: body['output'] });
    return { status: 200, body: { ok: true, build } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 400, body: { ok: false, error: message } };
  }
};

export const validateHandler = async (ctx: UiContext): Promise<{ status: number; body: unknown }> => {
  const report = await validateTokens(tokensPath(ctx));
  return { status: 200, body: report };
};

export const resetHandler = async (ctx: UiContext): Promise<{ status: number; body: unknown }> => {
  const path = tokensPath(ctx);
  writeFileSync(path, JSON.stringify(SAMPLE_TOKENS, null, 2) + '\n', 'utf8');
  ctx.log?.(`reset ${path} to sample tokens`);
  const report = await validateTokens(path);
  const build = await runBuild(ctx);
  return { status: 200, body: { ok: true, tokens: SAMPLE_TOKENS, issues: report.issues, build } };
};

/** Handle a single API request. Unknown routes yield 404. */
export const handleApi = async (
  ctx: UiContext,
  method: string,
  pathname: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> => {
  if (ctx.verbose === true) {
    ctx.log?.(`api ${method} ${pathname}`);
  }
  switch (`${method} ${pathname}`) {
    case 'GET /api/state':
      return { status: 200, body: stateHandler(ctx) };
    case 'GET /api/tokens':
      return tokensGetHandler(ctx);
    case 'PUT /api/tokens':
      return tokensPutHandler(ctx, body);
    case 'POST /api/build':
      return buildHandler(ctx, body);
    case 'POST /api/validate':
      return validateHandler(ctx);
    case 'POST /api/reset':
      return resetHandler(ctx);
    default:
      return { status: 404, body: { ok: false, error: `Unknown API route: ${method} ${pathname}` } };
  }
};
