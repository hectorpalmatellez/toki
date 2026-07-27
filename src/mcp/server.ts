import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readTokenFile, parseTokenDocument } from '../core/parser.js';
import { resolveDocument } from '../core/resolver.js';
import { generate } from '../core/pipeline.js';
import { runDiff } from '../core/diff.js';
import { writeArtifacts } from '../utils/writer.js';
import { parseFormats, implementedFormats } from '../generators/index.js';
import { scanFiles, TOKEN_TYPE_PATTERNS } from '../extractors/index.js';
import type { ExtractedToken, ScanResult } from '../extractors/index.js';
import { TOKI_VERSION } from '../version.js';
import { TokiError } from '../utils/errors.js';
import type { OutputFormat, NamingConvention, ResolvedToken, TokenType } from '../core/types.js';

const textContent = (text: string): { content: Array<{ type: 'text'; text: string }> } => ({
  content: [{ type: 'text', text }],
});

const errorContent = (message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const handleTokiError = (error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } => {
  if (error instanceof TokiError) {
    return errorContent(`[${error.code}] ${error.message}`);
  }
  if (error instanceof Error) {
    return errorContent(error.message);
  }
  return errorContent(String(error));
};

const FORMATS_ENUM = implementedFormats() as readonly [string, ...string[]];

const formatEnumSchema = z.enum(FORMATS_ENUM);

const namingConventionSchema = z
  .enum(['camelCase', 'kebab-case', 'CONSTANT_CASE', 'SCREAMING_SNAKE_CASE'])
  .optional();

const extractedToResolved = (token: ExtractedToken): ResolvedToken => ({
  id: token.id,
  name: token.id,
  path: token.id.split('-'),
  type: (token.inferredType ?? 'color') as TokenType,
  value: token.value,
});

export const createMcpServer = (): McpServer => {
  const server = new McpServer(
    { name: 'toki', version: TOKI_VERSION },
    { capabilities: { tools: {} } },
  );

  server.tool(
    'parse_tokens',
    'Parse and validate a W3C DTCG token file. Returns the token tree structure or validation errors.',
    { input: z.string().describe('Path to the token file (W3C DTCG JSON)') },
    async ({ input }) => {
      try {
        const raw = await readTokenFile(input);
        const doc = parseTokenDocument(raw, input);
        return textContent(
          JSON.stringify(
            {
              valid: true,
              tokenCount: doc.tokens.length,
              tree: doc.tree,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return handleTokiError(error);
      }
    },
  );

  server.tool(
    'resolve_tokens',
    'Expand references and show resolved token values. Applies $type inheritance and replaces {group.token} references with concrete values.',
    { input: z.string().describe('Path to the token file (W3C DTCG JSON)') },
    async ({ input }) => {
      try {
        const raw = await readTokenFile(input);
        const doc = parseTokenDocument(raw, input);
        const tokens = resolveDocument(doc);
        return textContent(
          JSON.stringify(
            {
              tokenCount: tokens.length,
              tokens,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return handleTokiError(error);
      }
    },
  );

  server.tool(
    'preview_format',
    'Generate output for a specific platform format and return the artifact content without writing to disk.',
    {
      input: z.string().describe('Path to the token file (W3C DTCG JSON)'),
      format: formatEnumSchema.describe('Target output format'),
      naming: namingConventionSchema.describe('Override naming convention for this format'),
    },
    async ({ input, format, naming }) => {
      try {
        const raw = await readTokenFile(input);
        const doc = parseTokenDocument(raw, input);
        const tokens = resolveDocument(doc);
        const formats: readonly OutputFormat[] = [format as OutputFormat];
        const namingOverride =
          naming !== undefined
            ? { [format as OutputFormat]: naming as NamingConvention }
            : undefined;
        const result = generate(tokens, {
          formats,
          ...(namingOverride !== undefined ? { naming: namingOverride } : {}),
        });
        return textContent(
          JSON.stringify(
            {
              artifacts: result.artifacts.map((a) => ({
                relativePath: a.relativePath,
                format: a.format,
                content: a.content,
              })),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return handleTokiError(error);
      }
    },
  );

  server.tool(
    'build_tokens',
    'Run the full pipeline: parse, resolve, transform, generate, and write artifacts to disk.',
    {
      input: z.string().describe('Path to the token file (W3C DTCG JSON)'),
      output: z.string().describe('Output directory for generated artifacts'),
      formats: z
        .array(formatEnumSchema)
        .describe('Output formats to generate'),
      clean: z.boolean().optional().default(true).describe('Clean output directories before writing'),
      verbose: z.boolean().optional().default(false).describe('Enable verbose logging'),
    },
    async ({ input, output, formats: rawFormats, clean, verbose }) => {
      try {
        const formats = parseFormats(rawFormats as string[]);
        const start = performance.now();
        const raw = await readTokenFile(input);
        const doc = parseTokenDocument(raw, input);
        const tokens = resolveDocument(doc);
        const result = generate(tokens, { formats });
        const elapsed = performance.now() - start;
        const writeResult = await writeArtifacts(output, result.artifacts, { clean });

        if (verbose) {
          console.error(`toki mcp: built ${writeResult.written.length} artifacts in ${elapsed.toFixed(1)}ms`);
        }

        return textContent(
          JSON.stringify(
            {
              written: writeResult.written,
              tokenCount: result.tokenCount,
              elapsed: Math.round(elapsed),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return handleTokiError(error);
      }
    },
  );

  server.tool(
    'diff_tokens',
    'Compare two token files and report added, removed, and changed tokens.',
    {
      old: z.string().describe('Path to the old token file'),
      new: z.string().describe('Path to the new token file'),
    },
    async ({ old: oldPath, new: newPath }) => {
      try {
        const result = await runDiff(oldPath, newPath);
        return textContent(
          JSON.stringify(
            {
              added: result.added,
              removed: result.removed,
              changed: result.changed,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return handleTokiError(error);
      }
    },
  );

  server.tool(
    'list_formats',
    'List all available output formats supported by Toki.',
    {},
    async () => {
      return textContent(
        JSON.stringify({ formats: implementedFormats() }, null, 2),
      );
    },
  );

  const outputModeSchema = z
    .union([z.literal('raw'), z.literal('json'), formatEnumSchema])
    .optional()
    .default('raw');

  server.tool(
    'extract_tokens',
    'Scan CSS/SCSS files in a project directory, extract design token candidates (custom properties and variables), infer their types, and return the raw data for the AI agent to organize. Optionally outputs flat JSON or pipes through Toki pipeline to generate a specific format.',
    {
      path: z.string().describe('File or directory path to scan for CSS/SCSS tokens'),
      extensions: z
        .array(z.string())
        .optional()
        .default(['.css', '.scss'])
        .describe('File extensions to scan'),
      output: outputModeSchema.describe(
        'Output mode: "raw" returns extracted data + Toki type reference for AI organization; "json" returns flat token map; or any output format name (css, js, etc.) to generate artifacts',
      ),
    },
    async ({ path: scanPath, extensions, output }) => {
      try {
        const result: ScanResult = await scanFiles({ path: scanPath, extensions });

        if (result.errors.length > 0 && result.tokens.length === 0) {
          return errorContent(
            `Scan failed:\n${result.errors.map((e) => `  ${e.file}: ${e.message}`).join('\n')}`,
          );
        }

        if (output === 'raw') {
          const byType: Record<string, number> = {};
          let untyped = 0;
          for (const token of result.tokens) {
            if (token.inferredType !== undefined) {
              byType[token.inferredType] = (byType[token.inferredType] ?? 0) + 1;
            } else {
              untyped++;
            }
          }

          const tokenTypes = Object.entries(TOKEN_TYPE_PATTERNS).map(([type, info]) => ({
            type,
            patterns: info.patterns,
            examples: info.examples,
          }));

          return textContent(
            JSON.stringify(
              {
                extracted: result.tokens,
                summary: {
                  totalExtracted: result.tokens.length,
                  byType,
                  untyped,
                  sources: result.sources,
                },
                errors: result.errors,
                tokiReference: {
                  tokenTypes,
                  outputFormats: implementedFormats(),
                  hint: 'Use the extracted tokens and type reference above to organize tokens into a W3C DTCG structure. Write the organized JSON to a file, then call build_tokens or preview_format to generate output.',
                },
              },
              null,
              2,
            ),
          );
        }

        if (output === 'json') {
          const flat: Record<string, { $type?: string; $value: string }> = {};
          for (const token of result.tokens) {
            const entry: { $type?: string; $value: string } = { $value: token.value };
            if (token.inferredType !== undefined) {
              entry.$type = token.inferredType;
            }
            flat[token.id] = entry;
          }
          return textContent(
            JSON.stringify(
              {
                tokens: flat,
                tokenCount: result.tokens.length,
                sources: result.sources,
              },
              null,
              2,
            ),
          );
        }

        const format = output as OutputFormat;
        const resolvedTokens = result.tokens
          .filter((t) => t.inferredType !== undefined)
          .map(extractedToResolved);
        const genResult = generate(resolvedTokens, { formats: [format] });
        return textContent(
          JSON.stringify(
            {
              format,
              artifacts: genResult.artifacts.map((a) => ({
                relativePath: a.relativePath,
                content: a.content,
              })),
              tokenCount: resolvedTokens.length,
              skippedUntyped: result.tokens.length - resolvedTokens.length,
              sources: result.sources,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return handleTokiError(error);
      }
    },
  );

  return server;
};

export const startMcpServer = async (): Promise<void> => {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
