import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const sampleTokens = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8' },
    secondary: { $value: '{color.primary}' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
    medium: { $value: '16px' },
  },
};

const uniqueDir = async (): Promise<string> => {
  const dir = join(tmpdir(), `toki-mcp-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

let client: Client;
let server: McpServer;
let clientTransport: InMemoryTransport;
let serverTransport: InMemoryTransport;

beforeAll(async () => {
  server = createMcpServer();
  [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe('MCP server', () => {
  it('lists all registered tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('parse_tokens');
    expect(names).toContain('resolve_tokens');
    expect(names).toContain('preview_format');
    expect(names).toContain('build_tokens');
    expect(names).toContain('diff_tokens');
    expect(names).toContain('list_formats');
    expect(tools.length).toBe(6);
  });
});

describe('parse_tokens', () => {
  it('parses a valid token file and returns the tree', async () => {
    const dir = await uniqueDir();
    const inputPath = join(dir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(sampleTokens), 'utf8');

    const result = await client.callTool({
      name: 'parse_tokens',
      arguments: { input: inputPath },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      valid: boolean;
      tokenCount: number;
    };
    expect(payload.valid).toBe(true);
    expect(payload.tokenCount).toBe(4);
  });

  it('returns an error for a non-existent file', async () => {
    const result = await client.callTool({
      name: 'parse_tokens',
      arguments: { input: '/nonexistent/tokens.json' },
    });

    expect(result.isError).toBe(true);
  });
});

describe('resolve_tokens', () => {
  it('resolves references and returns flat token list', async () => {
    const dir = await uniqueDir();
    const inputPath = join(dir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(sampleTokens), 'utf8');

    const result = await client.callTool({
      name: 'resolve_tokens',
      arguments: { input: inputPath },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      tokenCount: number;
      tokens: Array<{ id: string; value: unknown }>;
    };
    expect(payload.tokenCount).toBe(4);
    const secondary = payload.tokens.find((t) => t.id === 'color.secondary');
    expect(secondary?.value).toBe('#1a73e8');
  });
});

describe('preview_format', () => {
  it('generates CSS output without writing to disk', async () => {
    const dir = await uniqueDir();
    const inputPath = join(dir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(sampleTokens), 'utf8');

    const result = await client.callTool({
      name: 'preview_format',
      arguments: { input: inputPath, format: 'css' },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      artifacts: Array<{ relativePath: string; content: string }>;
    };
    expect(payload.artifacts.length).toBeGreaterThan(0);
    const css = payload.artifacts.find((a) => a.relativePath.endsWith('.css'));
    expect(css?.content).toContain('--color-primary: #1a73e8;');
    expect(css?.content).toContain('--color-secondary: #1a73e8;');
  });

  it('generates JS output', async () => {
    const dir = await uniqueDir();
    const inputPath = join(dir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(sampleTokens), 'utf8');

    const result = await client.callTool({
      name: 'preview_format',
      arguments: { input: inputPath, format: 'js' },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      artifacts: Array<{ relativePath: string; content: string }>;
    };
    const js = payload.artifacts.find((a) => a.relativePath.endsWith('.js'));
    expect(js?.content).toContain('colorPrimary');
  });
});

describe('build_tokens', () => {
  it('runs the full pipeline and writes artifacts to disk', async () => {
    const inputDir = await uniqueDir();
    const inputPath = join(inputDir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(sampleTokens), 'utf8');
    const outputDir = await uniqueDir();

    const result = await client.callTool({
      name: 'build_tokens',
      arguments: {
        input: inputPath,
        output: outputDir,
        formats: ['css', 'js'],
      },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      written: string[];
      tokenCount: number;
    };
    expect(payload.tokenCount).toBe(4);
    expect(payload.written.length).toBeGreaterThan(0);
    expect(payload.written.some((p) => p.endsWith('.css'))).toBe(true);
    expect(payload.written.some((p) => p.endsWith('.js'))).toBe(true);
  });
});

describe('diff_tokens', () => {
  it('compares two token files and reports changes', async () => {
    const dir = await uniqueDir();
    const oldPath = join(dir, 'old.json');
    const newPath = join(dir, 'new.json');

    const oldTokens = {
      color: { $type: 'color', primary: { $value: '#1a73e8' } },
    };
    const newTokens = {
      color: {
        $type: 'color',
        primary: { $value: '#2b8cef' },
        secondary: { $value: '#5f6368' },
      },
    };

    await writeFile(oldPath, JSON.stringify(oldTokens), 'utf8');
    await writeFile(newPath, JSON.stringify(newTokens), 'utf8');

    const result = await client.callTool({
      name: 'diff_tokens',
      arguments: { old: oldPath, new: newPath },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      added: Array<{ id: string }>;
      removed: Array<{ id: string }>;
      changed: Array<{ id: string }>;
    };
    expect(payload.added.length).toBe(1);
    expect(payload.added[0].id).toBe('color.secondary');
    expect(payload.changed.length).toBe(1);
    expect(payload.changed[0].id).toBe('color.primary');
    expect(payload.removed.length).toBe(0);
  });
});

describe('list_formats', () => {
  it('returns all supported output formats', async () => {
    const result = await client.callTool({
      name: 'list_formats',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      formats: string[];
    };
    expect(payload.formats).toContain('css');
    expect(payload.formats).toContain('js');
    expect(payload.formats).toContain('react-native');
    expect(payload.formats).toContain('angular');
    expect(payload.formats).toContain('svelte');
    expect(payload.formats).toContain('react');
    expect(payload.formats).toContain('stencil');
  });
});

