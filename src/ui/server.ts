/**
 * `toki ui` HTTP server: a zero-dependency `node:http` server that serves the
 * static editor app and the JSON API. Bound to `127.0.0.1` by default so it is
 * only reachable from the local machine.
 *
 * The static assets live in `dist/ui/` next to the bundled `dist/cli.js`; when
 * running from source (tests / dev) the `src/ui/public/` directory is used
 * instead. `createUiServer` keeps the server testable (injectable cwd + uiDir),
 * `startUi` wires it into the CLI lifecycle (banner, browser open, signals).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKI_VERSION } from '../version.js';
import { handleApi, type UiContext } from './api.js';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Resolve the directory holding the static editor assets. */
export const resolveUiDir = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'ui'), join(here, 'public'), resolve(here, '../ui')];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  throw new Error(
    'Missing UI assets: could not find index.html near the bundled server. ' +
      'Rebuild the package (pnpm build) or run from a source checkout.',
  );
};

const json = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
};

const sendText = (res: ServerResponse, status: number, text: string, type: string): void => {
  res.writeHead(status, { 'content-type': type });
  res.end(text);
};

const serveStatic = async (res: ServerResponse, uiDir: string, pathname: string): Promise<void> => {
  let name: string;
  if (pathname === '/' || pathname === '/index.html') {
    name = 'index.html';
  } else if (pathname.startsWith('/ui/')) {
    name = pathname.slice('/ui/'.length);
  } else if (pathname === '/app.js' || pathname === '/styles.css' || pathname === '/favicon.ico') {
    name = pathname.slice(1);
  } else {
    sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return;
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return;
  }
  const filePath = join(uiDir, name);
  try {
    const content = await readFile(filePath);
    const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime });
    res.end(content);
  } catch {
    sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
};

const readBody = async (req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw new Error('Request body too large.');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length === 0) return {};
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
};

/** Create the UI server. Call `server.listen` to start it. */
export const createUiServer = (ctx: UiContext, uiDir: string): Server => {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async (): Promise<void> => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathname = url.pathname;
      const method = (req.method ?? 'GET').toUpperCase();
      try {
        if (pathname.startsWith('/api/')) {
          if (method === 'PUT' || method === 'POST') {
            const body = await readBody(req);
            const result = await handleApi(ctx, method, pathname, body);
            json(res, result.status, result.body);
          } else {
            const result = await handleApi(ctx, method, pathname, {});
            json(res, result.status, result.body);
          }
          return;
        }
        if (method !== 'GET' && method !== 'HEAD') {
          sendText(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
          return;
        }
        await serveStatic(res, uiDir, pathname);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        json(res, 400, { ok: false, error: message });
      }
    })();
  });
  return server;
};

const openBrowser = (url: string): void => {
  const { platform } = process;
  let child: ReturnType<typeof spawn>;
  if (platform === 'darwin') {
    child = spawn('open', [url]);
  } else if (platform === 'win32') {
    child = spawn('cmd', ['/c', 'start', '', url]);
  } else {
    child = spawn('xdg-open', [url]);
  }
  child.on('error', () => {
    // No opener available — the printed URL still works.
  });
  child.unref();
};

export interface StartUiOptions {
  readonly port?: number;
  readonly host?: string;
  readonly open?: boolean;
  readonly verbose?: boolean;
  readonly cwd?: string;
  readonly log?: (msg: string) => void;
}

const DEFAULT_PORT = 4173;
const MAX_PORT_ATTEMPTS = 10;

/**
 * Start the UI server and block (resolves when the server is listening).
 * Binds to `127.0.0.1` by default; tries up to 10 consecutive ports.
 * Returns the running server.
 */
export const startUi = async (options: StartUiOptions = {}): Promise<Server> => {
  const ctx: UiContext = {
    cwd: options.cwd ?? process.cwd(),
    ...(options.verbose !== undefined ? { verbose: options.verbose } : {}),
    log: options.log ?? ((msg: string): void => console.log(`  ${msg}`)),
  };
  const uiDir = resolveUiDir();
  const host = options.host ?? '127.0.0.1';
  const server = createUiServer(ctx, uiDir);

  let port = options.port ?? DEFAULT_PORT;
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(port, host, () => {
          server.removeListener('error', rejectListen);
          resolveListen();
        });
      });
      break;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS - 1) {
        port += 1;
        continue;
      }
      throw error;
    }
  }

  const url = `http://${host}:${port}/`;
  console.log(`toki ui v${TOKI_VERSION}`);
  console.log(`  Editor:   ${url}`);
  console.log(`  Working:  ${ctx.cwd}`);
  console.log('  Press Ctrl+C to stop');

  if (options.open !== false) openBrowser(url);

  const shutdown = (): void => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
};
