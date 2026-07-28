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
    expect(names).toContain('extract_tokens');
    expect(tools.length).toBe(7);
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
    expect(payload.formats).toContain('vue');
    expect(payload.formats).toContain('tailwind');
    expect(payload.formats.length).toBe(10);
  });
});

describe('extract_tokens', () => {
  it('returns raw extracted data with type reference', async () => {
    const dir = await uniqueDir();
    await writeFile(
      join(dir, 'vars.css'),
      ':root {\n  --color-primary: #1a73e8;\n  --spacing-md: 16px;\n}\n',
      'utf8',
    );

    const result = await client.callTool({
      name: 'extract_tokens',
      arguments: { path: dir },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      extracted: Array<{ id: string; value: string; inferredType: string }>;
      summary: { totalExtracted: number; sources: string[] };
      tokiReference: { tokenTypes: Array<{ type: string }>; outputFormats: string[] };
    };
    expect(payload.summary.totalExtracted).toBe(2);
    expect(payload.extracted[0]?.inferredType).toBe('color');
    expect(payload.extracted[1]?.inferredType).toBe('dimension');
    expect(payload.tokiReference.tokenTypes.length).toBeGreaterThan(0);
    expect(payload.tokiReference.outputFormats).toContain('css');
  });

  it('returns flat JSON when output is "json"', async () => {
    const dir = await uniqueDir();
    await writeFile(
      join(dir, 'vars.css'),
      ':root {\n  --color-primary: #1a73e8;\n  --spacing-md: 16px;\n}\n',
      'utf8',
    );

    const result = await client.callTool({
      name: 'extract_tokens',
      arguments: { path: dir, output: 'json' },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      tokens: Record<string, { $type?: string; $value: string }>;
      tokenCount: number;
    };
    expect(payload.tokenCount).toBe(2);
    expect(payload.tokens['color-primary']?.$value).toBe('#1a73e8');
    expect(payload.tokens['color-primary']?.$type).toBe('color');
    expect(payload.tokens['spacing-md']?.$value).toBe('16px');
  });

  it('generates CSS output when output is a format name', async () => {
    const dir = await uniqueDir();
    await writeFile(
      join(dir, 'vars.css'),
      ':root {\n  --color-primary: #1a73e8;\n  --spacing-md: 16px;\n}\n',
      'utf8',
    );

    const result = await client.callTool({
      name: 'extract_tokens',
      arguments: { path: dir, output: 'css' },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      format: string;
      artifacts: Array<{ relativePath: string; content: string }>;
      tokenCount: number;
    };
    expect(payload.format).toBe('css');
    expect(payload.artifacts.length).toBeGreaterThan(0);
    expect(payload.tokenCount).toBeGreaterThan(0);
  });

  it('scans SCSS files', async () => {
    const dir = await uniqueDir();
    await writeFile(
      join(dir, '_theme.scss'),
      '$color-primary: #1a73e8;\n$spacing-md: 16px;\n',
      'utf8',
    );

    const result = await client.callTool({
      name: 'extract_tokens',
      arguments: { path: dir, output: 'json' },
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      tokens: Record<string, { $value: string }>;
      tokenCount: number;
    };
    expect(payload.tokenCount).toBe(2);
    expect(payload.tokens['color-primary']?.$value).toBe('#1a73e8');
  });

  it('returns error for non-existent path', async () => {
    const result = await client.callTool({
      name: 'extract_tokens',
      arguments: { path: '/nonexistent/path' },
    });

    expect(result.isError).toBe(true);
  });
});

describe('MCP resources', () => {
  it('lists 3 static resources', async () => {
    const { resources } = await client.listResources();
    expect(resources.length).toBe(3);
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['toki://formats', 'toki://token-types', 'toki://w3c-dtcg-spec']);
  });

  it('lists the resolved-tokens resource template', async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    const templates = resourceTemplates.map((t) => t.uriTemplate);
    expect(templates).toContain('toki://tokens/{+input}');
  });

  it('reads toki://formats with all format metadata', async () => {
    const result = await client.readResource({ uri: 'toki://formats' });
    expect(result.contents.length).toBe(1);
    const text = result.contents[0];
    if (text === undefined || !('text' in text)) throw new Error('expected text content');
    const payload = JSON.parse(text.text) as {
      formats: Array<{ id: string; description: string; namingDefault: string; artifacts: string[] }>;
    };
    expect(payload.formats.length).toBe(10);
    const css = payload.formats.find((f) => f.id === 'css');
    expect(css).toBeDefined();
    expect(css?.namingDefault).toBe('kebab-case');
    expect(css?.artifacts).toContain('css/tokens.css');
    const tailwind = payload.formats.find((f) => f.id === 'tailwind');
    expect(tailwind).toBeDefined();
    expect(tailwind?.artifacts).toContain('tailwind/tokens.css');
  });

  it('reads toki://token-types with all 13 token types', async () => {
    const result = await client.readResource({ uri: 'toki://token-types' });
    const text = result.contents[0];
    if (text === undefined || !('text' in text)) throw new Error('expected text content');
    const payload = JSON.parse(text.text) as {
      types: Array<{ type: string; patterns: string[]; examples: string[] }>;
    };
    expect(payload.types.length).toBe(13);
    const color = payload.types.find((t) => t.type === 'color');
    expect(color).toBeDefined();
    expect(color?.examples).toContain('#1a73e8');
  });

  it('reads toki://w3c-dtcg-spec as markdown', async () => {
    const result = await client.readResource({ uri: 'toki://w3c-dtcg-spec' });
    const text = result.contents[0];
    if (text === undefined || !('text' in text)) throw new Error('expected text content');
    expect(text.text).toContain('# W3C DTCG Format Reference');
    expect(text.text).toContain('$value');
    expect(text.text).toContain('{group.token}');
  });

  it('reads resolved-tokens resource with valid input', async () => {
    const dir = await uniqueDir();
    const inputPath = join(dir, 'tokens.json');
    await writeFile(inputPath, JSON.stringify(sampleTokens), 'utf8');

    const result = await client.readResource({ uri: `toki://tokens/${inputPath}` });
    expect(result.contents.length).toBe(1);
    const text = result.contents[0];
    if (text === undefined || !('text' in text)) throw new Error('expected text content');
    const payload = JSON.parse(text.text) as {
      tokenCount: number;
      tokens: Array<{ id: string; value: unknown; type: string }>;
    };
    expect(payload.tokenCount).toBe(4);
    expect(payload.tokens.length).toBe(4);
    const secondary = payload.tokens.find((t) => t.id === 'color.secondary');
    expect(secondary?.value).toBe('#1a73e8');
    expect(secondary?.type).toBe('color');
  });

  it('resolves references in the dynamic resource', async () => {
    const dir = await uniqueDir();
    const inputPath = join(dir, 'tokens.json');
    const tokensWithRefs = {
      color: {
        $type: 'color',
        base: { $value: '#ff0000' },
        alias: { $value: '{color.base}' },
        deep: { $value: '{color.alias}' },
      },
    };
    await writeFile(inputPath, JSON.stringify(tokensWithRefs), 'utf8');

    const result = await client.readResource({ uri: `toki://tokens/${inputPath}` });
    const text = result.contents[0];
    if (text === undefined || !('text' in text)) throw new Error('expected text content');
    const payload = JSON.parse(text.text) as {
      tokens: Array<{ id: string; value: unknown }>;
    };
    const alias = payload.tokens.find((t) => t.id === 'color.alias');
    expect(alias?.value).toBe('#ff0000');
    const deep = payload.tokens.find((t) => t.id === 'color.deep');
    expect(deep?.value).toBe('#ff0000');
  });

  it('returns error JSON for non-existent file', async () => {
    const result = await client.readResource({ uri: 'toki://tokens//nonexistent/tokens.json' });
    expect(result.contents.length).toBe(1);
    const text = result.contents[0];
    if (text === undefined || !('text' in text)) throw new Error('expected text content');
    const payload = JSON.parse(text.text) as { error: string };
    expect(payload.error).toBeDefined();
    expect(typeof payload.error).toBe('string');
  });
});

describe('MCP prompts', () => {
  it('lists 3 prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBe(3);
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual(['migrate-css-tokens', 'preview-all-formats', 'validate-tokens']);
  });

  it('gets migrate-css-tokens prompt with interpolated path', async () => {
    const result = await client.getPrompt({
      name: 'migrate-css-tokens',
      arguments: { path: './src', formats: 'css,js,react' },
    });
    expect(result.messages.length).toBe(1);
    const msg = result.messages[0];
    if (msg === undefined) throw new Error('expected message');
    expect(msg.role).toBe('user');
    if (msg.content.type !== 'text') throw new Error('expected text content');
    expect(msg.content.text).toContain('./src');
    expect(msg.content.text).toContain('css,js,react');
    expect(msg.content.text).toContain('extract_tokens');
  });

  it('gets validate-tokens prompt with interpolated input', async () => {
    const result = await client.getPrompt({
      name: 'validate-tokens',
      arguments: { input: './tokens.json' },
    });
    expect(result.messages.length).toBe(1);
    const msg = result.messages[0];
    if (msg === undefined) throw new Error('expected message');
    expect(msg.role).toBe('user');
    if (msg.content.type !== 'text') throw new Error('expected text content');
    expect(msg.content.text).toContain('./tokens.json');
    expect(msg.content.text).toContain('parse_tokens');
    expect(msg.content.text).toContain('resolve_tokens');
  });

  it('gets preview-all-formats prompt with interpolated arguments', async () => {
    const result = await client.getPrompt({
      name: 'preview-all-formats',
      arguments: { input: './tokens.json', formats: 'css,js' },
    });
    expect(result.messages.length).toBe(1);
    const msg = result.messages[0];
    if (msg === undefined) throw new Error('expected message');
    expect(msg.role).toBe('user');
    if (msg.content.type !== 'text') throw new Error('expected text content');
    expect(msg.content.text).toContain('./tokens.json');
    expect(msg.content.text).toContain('css,js');
    expect(msg.content.text).toContain('preview_format');
  });
});
