#!/usr/bin/env node
/**
 * Toki CLI entry point.
 *
 *   toki build --input tokens.json --output ./dist --format css,js
 *   toki init
 *
 * Drives the pipeline (Parse → Resolve → Generate → Write) and reports a
 * concise summary. Errors of type `TokiError` are formatted cleanly;
 * unknown errors surface their stack under `--verbose`.
 */

import { Command } from 'commander';
import { runPipeline, type BuildCacheOptions } from './core/pipeline.js';
import { writeArtifacts } from './utils/writer.js';
import { parseFormats } from './generators/index.js';
import { TOKI_VERSION } from './version.js';
import { TokiError } from './utils/errors.js';
import { loadConfig, mergeConfig, discoverConfig } from './core/config.js';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { sha256 } from './utils/hashing.js';
import { runDiff, formatDiffTerminal, formatDiffJson, formatDiffMarkdown } from './core/diff.js';
import { startWatch } from './core/watch.js';
import { importStyleDictionary } from './importers/style-dictionary.js';
import { importFigmaTokens } from './importers/figma-tokens.js';
import { validateTokens, formatValidateTerminal } from './core/validate.js';

const buildCommand = async (options: {
  input?: string;
  output?: string;
  format: string[];
  clean: boolean;
  cache: boolean;
  verbose: boolean;
  config?: string;
  theme?: string;
}): Promise<void> => {
  const config = loadConfig(options.config);
  const cliOpts: {
    input?: string;
    output?: string;
    format?: readonly string[];
    clean?: boolean;
    cache?: boolean;
  } = {};
  if (options.input !== undefined) cliOpts.input = options.input;
  if (options.output !== undefined) cliOpts.output = options.output;
  cliOpts.format = options.format;
  cliOpts.clean = options.clean;
  if (options.cache === false) cliOpts.cache = false;
  const resolved = mergeConfig(config, cliOpts);

  const formats = parseFormats(resolved.formats as string[]);

  // The config file bytes stand in for `transforms` (functions can't be
  // hashed): editing the config invalidates the build cache.
  const configPath = options.config ?? discoverConfig(process.cwd());
  const configHash = configPath !== undefined ? sha256(readFileSync(configPath, 'utf8')) : undefined;
  const buildCache = (output: string): BuildCacheOptions | undefined => {
    if (!resolved.cache) return undefined;
    const base: BuildCacheOptions = { dir: join(process.cwd(), '.toki'), output };
    if (configHash !== undefined) return { ...base, configHash };
    return base;
  };

  if (options.verbose) {
    console.log(`toki v${TOKI_VERSION}`);
    if (options.config ?? config !== undefined) {
      console.log(`  config: ${options.config ?? 'discovered'}`);
    }
    console.log(`  input:  ${resolved.input}`);
    console.log(`  output: ${resolved.output}`);
    console.log(`  formats: ${formats.join(', ')}`);
    if (resolved.themes !== undefined) {
      console.log(`  themes: ${Object.keys(resolved.themes).join(', ')}`);
    }
  }

  // Multi-theme: if config has themes, build each one separately.
  const themes = resolved.themes;
  if (themes !== undefined && Object.keys(themes).length > 0) {
    const themeNames = options.theme ? [options.theme] : Object.keys(themes);

    for (const themeName of themeNames) {
      const tokenFile = themes[themeName];
      if (tokenFile === undefined) {
        throw new TokiError(
          `Unknown theme "${themeName}". Available: ${Object.keys(themes).join(', ')}`,
          'CONFIG_ERROR',
        );
      }

      if (options.verbose) {
        console.log(`\n  theme "${themeName}": ${tokenFile}`);
      }

      const start = performance.now();
      const cache = buildCache(resolved.output);
      const result = await runPipeline({
        input: tokenFile,
        formats,
        verbose: options.verbose,
        theme: themeName,
        ...(resolved.naming !== undefined ? { naming: resolved.naming } : {}),
        ...(resolved.transforms !== undefined ? { transforms: resolved.transforms } : {}),
        ...(cache !== undefined ? { cache } : {}),
      });
      const elapsed = performance.now() - start;

      if (options.verbose) {
        console.log(
          `  resolved ${result.tokenCount} token${result.tokenCount === 1 ? '' : 's'} in ${elapsed.toFixed(1)}ms${result.cached ? ' (cached)' : ''}`,
        );
      }

      if (result.cached) {
        console.log(
          `No changes — ${result.tokenCount} token${result.tokenCount === 1 ? '' : 's'} up to date (cached)` +
            ` [theme: ${themeName}] → ${resolved.output}`,
        );
        continue;
      }

      const writeResult = await writeArtifacts(resolved.output, result.artifacts, {
        clean: resolved.clean,
      });

      console.log(
        `Built ${writeResult.written.length} artifact${writeResult.written.length === 1 ? '' : 's'}` +
          ` from ${result.tokenCount} token${result.tokenCount === 1 ? '' : 's'}` +
          ` [theme: ${themeName}] → ${resolved.output}`,
      );
      for (const path of writeResult.written) {
        console.log(`  ${path}`);
      }
    }
  } else {
    // Single-theme build (no themes in config).
    const start = performance.now();
    const cache = buildCache(resolved.output);
    const result = await runPipeline({
      input: resolved.input,
      formats,
      verbose: options.verbose,
      ...(resolved.naming !== undefined ? { naming: resolved.naming } : {}),
      ...(resolved.transforms !== undefined ? { transforms: resolved.transforms } : {}),
      ...(cache !== undefined ? { cache } : {}),
    });
    const elapsed = performance.now() - start;

    if (options.verbose) {
      console.log(
        `  resolved ${result.tokenCount} token${result.tokenCount === 1 ? '' : 's'} in ${elapsed.toFixed(1)}ms${result.cached ? ' (cached)' : ''}`,
      );
    }

    if (result.cached) {
      console.log(
        `No changes — ${result.tokenCount} token${result.tokenCount === 1 ? '' : 's'} up to date (cached) → ${resolved.output}`,
      );
      return;
    }

    const writeResult = await writeArtifacts(resolved.output, result.artifacts, {
      clean: resolved.clean,
    });

    console.log(
      `Built ${writeResult.written.length} artifact${writeResult.written.length === 1 ? '' : 's'}` +
        ` from ${result.tokenCount} token${result.tokenCount === 1 ? '' : 's'} → ${resolved.output}`,
    );
    for (const path of writeResult.written) {
      console.log(`  ${path}`);
    }
  }
};

const SAMPLE_TOKENS = {
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

const SAMPLE_CONFIG = `import type { TokiConfig } from "toki";

const config: TokiConfig = {
  input: "./tokens.json",
  output: "./dist/tokens",
  formats: ["css", "js"],
};

export default config;
`;

const initCommand = async (options: { readonly dir?: string }): Promise<void> => {
  const dir = options.dir ?? process.cwd();
  const tokenPath = resolve(dir, 'tokens.json');
  const configPath = resolve(dir, 'toki.config.ts');

  if (existsSync(tokenPath)) {
    console.log(`  tokens.json already exists at ${tokenPath}`);
    console.log('  Skipping token file creation.');
  } else {
    writeFileSync(tokenPath, JSON.stringify(SAMPLE_TOKENS, null, 2) + '\n', 'utf8');
    console.log(`  Created ${tokenPath}`);
  }

  if (existsSync(configPath)) {
    console.log(`  toki.config.ts already exists at ${configPath}`);
    console.log('  Skipping config file creation.');
  } else {
    writeFileSync(configPath, SAMPLE_CONFIG, 'utf8');
    console.log(`  Created ${configPath}`);
  }

  console.log('\n  Next steps:');
  console.log('    npx toki build');
};

const program = new Command();

program
  .name('toki')
  .description('Design token pipeline CLI — W3C DTCG in, framework-specific code out')
  .version(TOKI_VERSION);

program
  .command('build')
  .description('Parse tokens and generate output artifacts')
  .option('-i, --input <path>', 'Path to input token file (W3C DTCG JSON)')
  .option('-o, --output <path>', 'Output directory for generated artifacts')
  .option(
    '-f, --format <formats...>',
    'Output formats: css, js, react-native, angular, angular-11, svelte, react (use "all" for every platform; comma- or space-separated)',
    ['css', 'js'],
  )
  .option('--no-clean', 'Do not clean output subdirectories before writing')
  .option('--no-cache', 'Disable the incremental build cache')
  .option('--verbose', 'Enable verbose output with resolution trace and timing', false)
  .option('-c, --config <path>', 'Path to toki config file')
  .option('-t, --theme <name>', 'Build a single theme from multi-theme config')
  .action(async (options) => {
    try {
      await buildCommand({
        input: options.input,
        output: options.output,
        format: options.format as string[],
        clean: options.clean,
        cache: options.cache !== false,
        verbose: options.verbose,
        config: options.config,
        theme: options.theme,
      });
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('init')
  .description('Scaffold a starter project with sample tokens and config')
  .option('--dir <path>', 'Directory to scaffold in (default: current directory)')
  .action(async (options) => {
    try {
      await initCommand({ dir: options.dir });
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('diff')
  .description('Compare two token files and report added, removed, and changed tokens')
  .argument('<old>', 'Path to the old token file (W3C DTCG JSON)')
  .argument('<new>', 'Path to the new token file (W3C DTCG JSON)')
  .option('--json', 'Output as JSON instead of human-readable text', false)
  .option('--markdown', 'Output as GitHub-compatible Markdown', false)
  .action(async (oldPath: string, newPath: string, options: { json: boolean; markdown: boolean }) => {
    try {
      const result = await runDiff(oldPath, newPath);
      if (options.markdown) {
        console.log(formatDiffMarkdown(result));
      } else if (options.json) {
        console.log(JSON.stringify(formatDiffJson(result), null, 2));
      } else {
        const output = formatDiffTerminal(result);
        console.log(output);
        const total = result.added.length + result.removed.length + result.changed.length;
        if (total > 0) {
          console.log(`\n  ${total} difference${total === 1 ? '' : 's'} found.`);
        }
      }
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('validate')
  .description('Validate a token file for structural correctness and quality')
  .requiredOption('-i, --input <path>', 'Path to the token file (W3C DTCG JSON)')
  .option('--json', 'Output as JSON instead of human-readable text', false)
  .option('--strict', 'Treat warnings as errors (non-zero exit)', false)
  .option('-c, --config <path>', 'Path to toki config file')
  .action(async (options: { input: string; json: boolean; strict: boolean }) => {
    try {
      const report = await validateTokens(options.input);
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatValidateTerminal(report, options.input));
      }
      const hasErrors = report.issues.some((i) => i.severity === 'error');
      const hasWarnings = report.issues.some((i) => i.severity === 'warning');
      if (hasErrors || (options.strict && hasWarnings)) {
        process.exitCode = 1;
      }
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('watch')
  .description('Watch token files for changes and rebuild automatically')
  .option('-i, --input <path>', 'Path to input token file (W3C DTCG JSON)')
  .option('-o, --output <path>', 'Output directory for generated artifacts')
  .option(
    '-f, --format <formats...>',
    'Output formats: css, js, react-native, angular, angular-11, svelte, react (use "all" for every platform; comma- or space-separated)',
    ['css', 'js'],
  )
  .option('--no-clean', 'Do not clean output subdirectories before writing')
  .option('--no-cache', 'Disable the incremental build cache')
  .option('--verbose', 'Enable verbose output with resolution trace and timing', false)
  .option('-c, --config <path>', 'Path to toki config file')
  .option('-t, --theme <name>', 'Build a single theme from multi-theme config')
  .action(async (options) => {
    try {
      await startWatch({
        input: options.input,
        output: options.output,
        format: options.format as string[],
        clean: options.clean,
        cache: options.cache !== false,
        verbose: options.verbose,
        config: options.config,
        theme: options.theme,
      });
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('import')
  .description('Import tokens from another format and convert to W3C DTCG')
  .requiredOption('--from <format>', 'Source format: style-dictionary, figma-tokens')
  .requiredOption('-i, --input <path>', 'Path to input token file')
  .option('-o, --output <path>', 'Output path for generated tokens.json')
  .action(async (options: { from: string; input: string; output?: string }) => {
    try {
      let outputPath: string;
      const importOpts = { input: options.input, ...(options.output !== undefined ? { output: options.output } : {}) };
      switch (options.from) {
        case 'style-dictionary':
          outputPath = await importStyleDictionary(importOpts);
          break;
        case 'figma-tokens':
          outputPath = await importFigmaTokens(importOpts);
          break;
        default:
          throw new TokiError(
            `Unknown source format "${options.from}". Supported: style-dictionary, figma-tokens.`,
            'CONFIG_ERROR',
          );
      }
      console.log(`  Imported tokens written to ${outputPath}`);
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('mcp')
  .description('Start the MCP server for AI tool integration (stdio transport)')
  .action(async () => {
    try {
      const { startMcpServer } = await import('./mcp/server.js');
      await startMcpServer();
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

export { program };
export { buildCommand };
export { parseFormats };

export const run = async (): Promise<void> => {
  // If no arguments and running interactively, launch the TUI.
  if (process.argv.length <= 2 && process.stdout.isTTY) {
    const { runTui } = await import('./tui.js');
    await runTui();
    return;
  }
  await program.parseAsync();
};

// Auto-invoke only when executed as the main entry (the bin). Guards against
// firing when this module is imported during tests or as a library barrel.
const isMainEntry = (): boolean => {
  const arg = process.argv[1];
  if (!arg) return false;
  return arg.endsWith('cli.js') || arg.endsWith('cli.ts') || arg.endsWith('toki');
};

if (isMainEntry()) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
