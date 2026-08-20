import { intro, outro, select, multiselect, text, confirm, isCancel, cancel, spinner } from '@clack/prompts';
import { buildCommand } from './cli.js';
import { implementedFormats } from './generators/index.js';
import { startWatch } from './core/watch.js';
import { runDiff, formatDiffTerminal, formatDiffJson } from './core/diff.js';
import { importStyleDictionary } from './importers/style-dictionary.js';
import { importFigmaTokens } from './importers/figma-tokens.js';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOKI_VERSION } from './version.js';

type Command = 'build' | 'init' | 'diff' | 'watch' | 'import' | 'ui';

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

export const runTui = async (): Promise<void> => {
  intro(`toki v${TOKI_VERSION} — Design token pipeline CLI`);

  const command = await select<Command>({
    message: 'What would you like to do?',
    options: [
      { value: 'build' as const, label: 'build   — Parse tokens and generate output artifacts' },
      { value: 'init' as const, label: 'init    — Scaffold a starter project with sample tokens and config' },
      { value: 'diff' as const, label: 'diff    — Compare two token files (added/removed/changed)' },
      { value: 'watch' as const, label: 'watch   — Watch token files for changes and rebuild automatically' },
      {
        value: 'import' as const,
        label: 'import  — Import tokens from another format (Style Dictionary / Figma Tokens)',
      },
      {
        value: 'ui' as const,
        label: 'ui      — Start the local web editor for creating and building tokens',
      },
    ],
  });

  if (isCancel(command)) {
    cancel('Cancelled.');
    process.exit(0);
  }

  switch (command) {
    case 'init': {
      const dir = await text({
        message: 'Directory to scaffold in',
        placeholder: 'current directory',
      });
      if (isCancel(dir)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const targetDir = (dir as string).trim() || process.cwd();

      const sp = spinner();
      sp.start('Scaffolding project...');
      const tokenPath = resolve(targetDir, 'tokens.json');
      const configPath = resolve(targetDir, 'toki.config.ts');
      if (!existsSync(tokenPath)) {
        writeFileSync(tokenPath, JSON.stringify(SAMPLE_TOKENS, null, 2) + '\n', 'utf8');
      }
      if (!existsSync(configPath)) {
        writeFileSync(configPath, SAMPLE_CONFIG, 'utf8');
      }
      sp.stop('Project scaffolded');
      console.log(`  Created ${tokenPath}`);
      console.log(`  Created ${configPath}`);
      console.log('\n  Next: npx toki build');
      break;
    }

    case 'diff': {
      const oldPath = await text({ message: 'Path to the old token file', placeholder: 'tokens-old.json' });
      if (isCancel(oldPath)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const newPath = await text({ message: 'Path to the new token file', placeholder: 'tokens-new.json' });
      if (isCancel(newPath)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const jsonOutput = await confirm({ message: 'Output as JSON?', initialValue: false });
      if (isCancel(jsonOutput)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      try {
        const result = await runDiff(oldPath as string, newPath as string);
        if (jsonOutput) {
          console.log(JSON.stringify(formatDiffJson(result), null, 2));
        } else {
          console.log(formatDiffTerminal(result));
          const total = result.added.length + result.removed.length + result.changed.length;
          if (total > 0) {
            console.log(`\n  ${total} difference${total === 1 ? '' : 's'} found.`);
          }
        }
      } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
      }
      break;
    }

    case 'watch': {
      const formats = await multiselect<string>({
        message: 'Output formats',
        options: implementedFormats().map((f) => ({ value: f, label: f })),
        required: true,
      });
      if (isCancel(formats)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const verbose = await confirm({ message: 'Enable verbose output?', initialValue: false });
      if (isCancel(verbose)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      try {
        const formatList = formats as string[];
        const cleanup = await startWatch({
          format: formatList,
          clean: true,
          cache: true,
          verbose: verbose as boolean,
        });
        process.on('SIGINT', () => {
          cleanup();
          process.exit(0);
        });
        process.on('SIGTERM', () => {
          cleanup();
          process.exit(0);
        });
      } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
      }
      break;
    }

    case 'import': {
      const fromFormat = await select<string>({
        message: 'Source format',
        options: [
          { value: 'style-dictionary', label: 'Style Dictionary' },
          { value: 'figma-tokens', label: 'Figma Tokens Studio' },
        ],
      });
      if (isCancel(fromFormat)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const inputPath = await text({ message: 'Path to input token file', placeholder: 'input.json' });
      if (isCancel(inputPath)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      try {
        let outputPath: string;
        const opts = { input: inputPath as string };
        if (fromFormat === 'style-dictionary') {
          outputPath = await importStyleDictionary(opts);
        } else {
          outputPath = await importFigmaTokens(opts);
        }
        console.log(`  Imported tokens written to ${outputPath}`);
      } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
      }
      break;
    }

    case 'ui': {
      try {
        const { startUi } = await import('./ui/server.js');
        await startUi({ open: true });
      } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
      }
      break;
    }

    default: {
      const input = await text({ message: 'Path to input token file', placeholder: 'tokens.json' });
      if (isCancel(input)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const output = await text({ message: 'Output directory', placeholder: 'dist' });
      if (isCancel(output)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const formats = await multiselect<string>({
        message: 'Output formats',
        options: implementedFormats().map((f) => ({ value: f, label: f })),
        required: true,
        initialValues: ['css', 'js'],
      });
      if (isCancel(formats)) {
        cancel('Cancelled.');
        process.exit(0);
      }
      const verbose = await confirm({ message: 'Enable verbose output?', initialValue: false });
      if (isCancel(verbose)) {
        cancel('Cancelled.');
        process.exit(0);
      }

      try {
        await buildCommand({
          input: input as string,
          output: output as string,
          format: formats as string[],
          formatProvided: true,
          clean: true,
          cache: true,
          verbose: verbose as boolean,
        });
      } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
      }
    }
  }

  outro('Done.');
};
