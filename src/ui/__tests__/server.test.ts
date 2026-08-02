import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUiServer } from '../server.js';
import type { UiContext } from '../api.js';

const UI_DIR = resolve(fileURLToPath(new URL('../public', import.meta.url)));

const SAMPLE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
    secondary: { $value: '#5f6368' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
    medium: { $value: '16px' },
  },
};

interface ServerHandle {
  readonly base: string;
  readonly close: () => Promise<void>;
}

const tempDirs: string[] = [];

const startServer = async (cwd: string, uiDir = UI_DIR): Promise<ServerHandle> => {
  const ctx: UiContext = { cwd, verbose: false };
  const server = createUiServer(ctx, uiDir);
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  const port = address !== null && typeof address === 'object' ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
};

const fetchJson = async <T>(base: string, path: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const res = await fetch(`${base}${path}`, init);
  const body = (await res.json()) as T;
  return { status: res.status, body };
};

const fetchStatus = async (base: string, path: string, init?: RequestInit): Promise<number> => {
  const res = await fetch(`${base}${path}`, init);
  return res.status;
};

const putTokens = (base: string, tokens: unknown): Promise<{ status: number; body: { ok: boolean; error?: string } }> =>
  fetchJson(base, '/api/tokens', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokens, formats: ['css', 'js'], output: './dist' }),
  });

let handle: ServerHandle | undefined;
let cwd = '';

afterEach(async () => {
  await handle?.close();
  handle = undefined;
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe('toki ui server', () => {
  it('serves the editor app at /', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const res = await fetch(`${handle.base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('toki');
    expect(html).toContain('app.js');
  });

  it('serves styles.css', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const res = await fetch(`${handle.base}/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
  });

  it('serves app.js as JavaScript from a built uiDir', async () => {
    const uiDir = mkdtempSync(join(tmpdir(), 'toki-ui-assets-'));
    tempDirs.push(uiDir);
    writeFileSync(join(uiDir, 'index.html'), '<html></html>');
    writeFileSync(join(uiDir, 'app.js'), 'console.log(1)');
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd, uiDir);
    const res = await fetch(`${handle.base}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('serves the editor at /index.html too', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const res = await fetch(`${handle.base}/index.html`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown static files', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const status = await fetchStatus(handle.base, '/not-a-file.txt');
    expect(status).toBe(404);
  });

  it('rejects path traversal in static routes', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const status = await fetchStatus(handle.base, '/ui/../secret');
    expect(status).toBe(404);
    const encoded = await fetchStatus(handle.base, '/ui/%2e%2e/secret');
    expect(encoded).toBe(404);
  });

  it('answers HEAD requests', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const res = await fetch(`${handle.base}/`, { method: 'HEAD' });
    expect(res.status).toBe(200);
  });

  it('rejects non-GET/HEAD methods with 405', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const res = await fetch(`${handle.base}/`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    const res2 = await fetch(`${handle.base}/app.js`, { method: 'POST' });
    expect(res2.status).toBe(405);
  });

  it('rejects malformed JSON bodies with a 400', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await fetchJson<{ status: number; body: { ok: boolean; error: string } }>(
      handle.base,
      '/api/tokens',
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{not json' },
    );
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('rejects non-object JSON bodies with a 400', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await fetchJson<{ status: number; body: { ok: boolean; error: string } }>(
      handle.base,
      '/api/tokens',
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '[1,2,3]' },
    );
    expect(status).toBe(400);
    expect(body.error).toContain('JSON object');
  });

  it('rejects oversized request bodies with a 400', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const huge = JSON.stringify({ tokens: 'x'.repeat(21 * 1024 * 1024) });
    const { status, body } = await fetchJson<{ status: number; body: { ok: boolean; error: string } }>(
      handle.base,
      '/api/tokens',
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: huge },
    );
    expect(status).toBe(400);
    expect(body.error).toContain('too large');
  });

  it('reports project state with no tokens', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await fetchJson<{
      status: number;
      body: { hasTokens: boolean; formats: string[]; cwd: string; prefs: object };
    }>(handle.base, '/api/state');
    expect(status).toBe(200);
    expect(body.cwd).toBe(cwd);
    expect(body.hasTokens).toBe(false);
    expect(body.formats).toContain('css');
    expect(body.formats).toContain('tailwind');
  });

  it('returns 404 for unknown API routes', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const status = await fetchStatus(handle.base, '/api/nope');
    expect(status).toBe(404);
  });

  it('serves a sample when no tokens.json exists', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await fetchJson<{
      status: number;
      body: { exists: boolean; tokens: unknown; sample: object };
    }>(handle.base, '/api/tokens');
    expect(status).toBe(200);
    expect(body.exists).toBe(false);
    expect(body.tokens).toBeNull();
    expect(body.sample).toBeDefined();
  });

  it('PUT writes tokens.json and runs a build', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await putTokens(handle.base, SAMPLE);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const tokensPath = join(cwd, 'tokens.json');
    expect(existsSync(tokensPath)).toBe(true);
    const written = JSON.parse(readFileSync(tokensPath, 'utf8')) as Record<string, unknown>;
    expect(written['color']).toBeDefined();

    expect(existsSync(join(cwd, 'dist', 'css'))).toBe(true);
    expect(existsSync(join(cwd, 'dist', 'js'))).toBe(true);
  });

  it('rejects invalid token payloads with a 400', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await putTokens(handle.base, { color: { $type: 'nope', x: { $value: '#fff' } } });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
    expect(existsSync(join(cwd, 'tokens.json'))).toBe(false);
  });

  it('GET /api/tokens returns the written file', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    await putTokens(handle.base, SAMPLE);
    const { status, body } = await fetchJson<{ status: number; body: { exists: boolean; tokens: object } }>(
      handle.base,
      '/api/tokens',
    );
    expect(status).toBe(200);
    expect(body.exists).toBe(true);
    expect(body.tokens).toEqual(SAMPLE);
  });

  it('POST /api/build honors requested formats', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    await putTokens(handle.base, SAMPLE);
    const { status, body } = await fetchJson<{
      status: number;
      body: { ok: boolean; build: { formats: string[]; artifacts: Array<{ format: string; relativePath: string }> } };
    }>(handle.base, '/api/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ formats: ['css'] }),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.build.formats).toEqual(['css']);
    expect(body.build.artifacts.every((a) => a.format === 'css')).toBe(true);
    expect(body.build.artifacts.length).toBeGreaterThan(0);
  });

  it('POST /api/build fails politely without tokens.json', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await fetchJson<{ status: number; body: { ok: boolean; error: string } }>(
      handle.base,
      '/api/build',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('tokens.json');
  });

  it('POST /api/validate returns a report', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    writeFileSync(join(cwd, 'tokens.json'), JSON.stringify(SAMPLE), 'utf8');
    const { status, body } = await fetchJson<{
      status: number;
      body: { valid: boolean; tokenCount: number; issues: unknown[] };
    }>(handle.base, '/api/validate', { method: 'POST' });
    expect(status).toBe(200);
    expect(body.tokenCount).toBe(4);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('POST /api/reset scaffolds the sample tokens', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    const { status, body } = await fetchJson<{ status: number; body: { ok: boolean; tokens: object } }>(
      handle.base,
      '/api/reset',
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const tokensPath = join(cwd, 'tokens.json');
    expect(existsSync(tokensPath)).toBe(true);
    const written = JSON.parse(readFileSync(tokensPath, 'utf8')) as Record<string, unknown>;
    expect(written['color']).toBeDefined();
    expect(written['typography']).toBeDefined();
  });

  it('persists UI preferences to .toki/ui.json', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'toki-ui-'));
    tempDirs.push(cwd);
    handle = await startServer(cwd);
    await putTokens(handle.base, SAMPLE);
    const prefsPath = join(cwd, '.toki', 'ui.json');
    expect(existsSync(prefsPath)).toBe(true);
    const prefs = JSON.parse(readFileSync(prefsPath, 'utf8')) as { formats?: string[] };
    expect(prefs.formats).toContain('css');
  });
});
