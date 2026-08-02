import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { resolveUiDir, startUi } from '../server.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn((..._args: unknown[]) => {
    const emitter = new EventEmitter();
    return {
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      unref: vi.fn(),
    };
  }),
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn(() => true),
}));

import { spawn } from 'node:child_process';

const occupied: Server[] = [];

const occupyPort = (port: number): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

const closeAll = async (servers: Server[]): Promise<void> => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
};

const addressOf = (server: Server): number => {
  const address = server.address();
  return address !== null && typeof address === 'object' ? (address.port as number) : 0;
};

describe('resolveUiDir', () => {
  it('finds a directory containing index.html', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const dir = resolveUiDir();
    expect(dir.length).toBeGreaterThan(0);
  });

  it('throws when no asset directory exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => resolveUiDir()).toThrow(/Missing UI assets/);
  });
});

describe('startUi', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.mocked(spawn).mockClear();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(async () => {
    await closeAll(occupied);
    occupied.length = 0;
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    logSpy.mockRestore();
  });

  it('starts on the requested port and prints the editor URL', async () => {
    const server = await startUi({ port: 0, open: false });
    occupied.push(server);
    expect(addressOf(server)).toBeGreaterThan(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('toki ui v'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('127.0.0.1'));
  });

  it('retries with the next port when the requested port is busy', async () => {
    const blocker = await occupyPort(4567);
    occupied.push(blocker);
    const server = await startUi({ port: 4567, open: false });
    occupied.push(server);
    expect(addressOf(server)).toBe(4568);
  });

  it('gives up after exhausting consecutive ports', async () => {
    for (let port = 5000; port < 5010; port++) {
      occupied.push(await occupyPort(port));
    }
    await expect(startUi({ port: 5000, open: false })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('opens the default browser on macOS', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    try {
      const server = await startUi({ port: 0, open: true });
      occupied.push(server);
      expect(spawn).toHaveBeenCalledWith('open', [expect.stringContaining('http://127.0.0.1:') as unknown as string]);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });

  it('opens the default browser on Windows', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const server = await startUi({ port: 0, open: true });
      occupied.push(server);
      expect(spawn).toHaveBeenCalledWith('cmd', ['/c', 'start', '', expect.stringContaining('http://127.0.0.1:') as unknown as string]);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });

  it('opens the default browser on Linux', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      const server = await startUi({ port: 0, open: true });
      occupied.push(server);
      expect(spawn).toHaveBeenCalledWith('xdg-open', [expect.stringContaining('http://127.0.0.1:') as unknown as string]);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });

  it('does not open the browser when disabled via CLI flag', async () => {
    const server = await startUi({ port: 0, open: false });
    occupied.push(server);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('tolerates a missing browser opener', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const mock = vi.mocked(spawn);
    const custom = vi.fn(() => {
      const emitter = new EventEmitter();
      const child = {
        on: emitter.on.bind(emitter),
        unref: vi.fn(),
      };
      setTimeout(() => emitter.emit('error', new Error('no opener')), 0);
      return child;
    });
    mock.mockImplementation(custom as unknown as typeof spawn);
    try {
      const server = await startUi({ port: 0, open: true });
      occupied.push(server);
      await new Promise((r) => setTimeout(r, 10));
      expect(custom).toHaveBeenCalled();
    } finally {
      mock.mockImplementation(
        (() => {
          const emitter = new EventEmitter();
          return { on: emitter.on.bind(emitter), unref: vi.fn() };
        }) as unknown as typeof spawn,
      );
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });
});
