# Toki — Usage Guide

## Commands

### `toki build`

Parse tokens and generate framework-specific output artifacts.

```bash
toki build --input tokens.json --output ./dist --format css,js,react
```

| Flag                        | Description                                                                                                                              | Default         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `-i, --input <path>`        | Path to input token file (W3C DTCG JSON)                                                                                                 | —               |
| `-o, --output <path>`       | Output directory for generated artifacts (relative to the current directory, or an absolute path)                                        | —               |
| `-f, --format <formats...>` | Output formats: `css`, `js`, `react-native`, `angular`, `angular-11`, `svelte`, `react`, `stencil`, `vue`, `tailwind` (or `all` for all) | `css, js`       |
| `-c, --config <path>`       | Path to toki config file                                                                                                                 | auto-discovered |
| `-t, --theme <name>`        | Build a single theme from multi-theme config                                                                                             | all themes      |
| `--clean` / `--no-clean`    | Clean the target platform subdirectories before writing                                                                                  | `true`          |
| `--no-cache`                | Disable the incremental build cache                                                                                                      | enabled         |
| `--verbose`                 | Print resolution trace, per-token values, and timing                                                                                     | `false`         |

### `toki init`

Scaffold a starter project with sample tokens and config.

```bash
toki init
toki init --dir ./my-project
```

Creates `tokens.json` (sample color, spacing, typography tokens) and `toki.config.ts`.

### `toki diff`

Compare two token files and report added, removed, and changed tokens.

```bash
toki diff tokens-old.json tokens-new.json
toki diff tokens-old.json tokens-new.json --json
```

| Flag         | Description                                   | Default |
| ------------ | --------------------------------------------- | ------- |
| `--json`     | Output as JSON instead of human-readable text | `false` |
| `--markdown` | Output as GitHub-compatible Markdown tables   | `false` |

Each difference includes the token's dotted path, its type, and the before/after values.

### `toki validate`

Lint token files for structural validity, broken references, circular dependencies, missing descriptions, naming convention violations, and duplicate values.

```bash
toki validate --input tokens.json
toki validate --input tokens.json --strict
toki validate --input tokens.json --json
```

| Flag                  | Description                                                        | Default         |
| --------------------- | ------------------------------------------------------------------ | --------------- |
| `-i, --input <path>`  | Path to input token file (W3C DTCG JSON)                           | —               |
| `-c, --config <path>` | Path to toki config file                                           | auto-discovered |
| `--json`              | Output as JSON instead of human-readable text                      | `false`         |
| `--strict`            | Treat warnings (missing descriptions, naming violations) as errors | `false`         |

### `toki schema`

Publish a JSON Schema (draft-07) per platform output format, describing the JSON view of the generated artifacts for your resolved token set. Associate the schemas with JSON files in your editor (VS Code `json.schemas`) for autocomplete and validation.

```bash
toki schema --input tokens.json --output ./schema/output --format css,js,react
toki schema                        # uses config file; publishes all formats
```

| Flag                        | Description                                                          | Default           |
| --------------------------- | -------------------------------------------------------------------- | ----------------- |
| `-i, --input <path>`        | Path to input token file (W3C DTCG JSON)                             | —                 |
| `-o, --output <path>`       | Output directory for schema files                                    | `./schema/output` |
| `-f, --format <formats...>` | Output formats (comma- or space-separated; `all` for every platform) | `all`             |
| `-c, --config <path>`       | Path to toki config file                                             | auto-discovered   |
| `-t, --theme <name>`        | Build a single theme from multi-theme config                         | all themes        |
| `--verbose`                 | Print the published schema file paths                                | `false`           |

Each `properties` entry lists the exact identifier or custom property the generator emits (e.g. `--color-primary`, `colorPrimary`, `COLOR_PRIMARY`, `colors.brand.primary`), typed by the resolved value (numbers stay numbers for React Native's dp/sp transforms), with `additionalProperties: false` and per-token descriptions.

**VS Code example** — validate any JSON document containing the token object for a platform:

```jsonc
// .vscode/settings.json
{
  "json.schemas": [
    {
      "fileMatch": ["**/tokens.*.css.json"],
      "url": "./schema/output/css.json",
    },
  ],
}
```

### `toki completions`

Generate editor completion specs from resolved tokens for design-system DX: an editor-agnostic spec plus adapters for VS Code snippets and LSP `CompletionItem`s. Each entry carries the dotted token id, type, resolved value, description, the `--kebab-case` CSS variable, and the camelCase identifier; insertions use the canonical `var(--color-primary)` reference.

```bash
toki completions --input tokens.json --output ./completions
toki completions --editor vscode --editor lsp        # skip the raw spec
```

| Flag                    | Description                                                                   | Default           |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------- |
| `-i, --input <path>`    | Path to input token file (W3C DTCG JSON)                                      | —                 |
| `-o, --output <path>`   | Output directory for completion files                                         | `./completions`   |
| `--editor <editors...>` | Editor targets: `spec`, `vscode`, `lsp`, or `all` (comma- or space-separated) | `spec vscode lsp` |
| `-c, --config <path>`   | Path to toki config file                                                      | auto-discovered   |
| `-t, --theme <name>`    | Build a single theme from multi-theme config                                  | all themes        |
| `--verbose`             | Print the written file paths                                                  | `false`           |

Output files (theme-suffixed when building themes, e.g. `tokens.dark.code-snippets`):

| File                   | Content                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `spec.json`            | Editor-agnostic completion spec (`$schema`, `version`, `tokens[]`)                               |
| `tokens.code-snippets` | VS Code snippet file — drop it into a `.vscode/` directory to complete `var(--...)` references   |
| `tokens.lsp.json`      | LSP `CompletionItem[]` document — feed to custom clients or convert with any LSP-compatible tool |

### `toki watch`

Watch token files for changes and rebuild automatically. Uses `chokidar` with a 200ms debounce.

```bash
toki watch --input tokens.json --output ./dist --format all
```

Same flags as `toki build`. Press Ctrl+C to stop.

### `toki import`

Import tokens from another format and convert to W3C DTCG.

```bash
toki import --from style-dictionary --input sd-config.json
toki import --from figma-tokens --input figma-tokens.json
```

| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `--from <format>`     | Source format: `style-dictionary` or `figma-tokens` |
| `-i, --input <path>`  | Path to input token file                            |
| `-o, --output <path>` | Output path for generated `tokens.json`             |

### `toki mcp`

Start the Model Context Protocol (MCP) server for AI tool integration. Uses stdio transport — no ports or network needed.

```bash
toki mcp
```

The MCP server exposes 7 tools, 3 resources, and 3 prompts that AI agents (Claude, Cursor, Windsurf) can call: `parse_tokens`, `resolve_tokens`, `preview_format`, `build_tokens`, `diff_tokens`, `list_formats`, and `extract_tokens`. Resources (`toki://formats`, `toki://token-types`, `toki://w3c-dtcg-spec`) and prompts (`migrate-css-tokens`, `validate-tokens`, `preview-all-formats`) are auto-discovered by MCP clients.

See the [MCP Guide](mcp.md) for full documentation, configuration examples, and workflows.

## Configuration file

Toki can be configured via a `toki.config.ts` (or `.js` / `.mjs`) file in your project root. When present, `toki build` auto-discovers the config and uses it as the default for all options.

**Discovery order:** `--config` flag → `toki.config.ts` → `toki.config.js` → `toki.config.mjs`

CLI flags override config file values.

```ts
// toki.config.ts
import type { TokiConfig } from 'toki';

const config: TokiConfig = {
  input: './tokens.json',
  output: './dist/tokens',
  formats: ['css', 'js', 'react-native'],
  clean: true,
};

export default config;
```

### Config fields

| Field        | Type                                     | Default               | Description                                                  |
| ------------ | ---------------------------------------- | --------------------- | ------------------------------------------------------------ |
| `input`      | `string \| string[]`                     | —                     | Input token file path(s) (required)                          |
| `output`     | `string`                                 | —                     | Output directory (required)                                  |
| `formats`    | `OutputFormat[]`                         | `['css', 'js']`       | Output formats to generate                                   |
| `themes`     | `Record<string, string>`                 | —                     | Theme name → token file mapping for multi-theme builds       |
| `naming`     | `Record<OutputFormat, NamingConvention>` | per-platform defaults | Per-format naming convention overrides                       |
| `transforms` | `TransformPlugin[]`                      | `[]`                  | Custom transform functions applied after built-in transforms |
| `clean`      | `boolean`                                | `true`                | Clean output subdirectories before writing                   |
| `cache`      | `boolean`                                | `true`                | Use the incremental build cache (see below)                  |

## Incremental builds

`toki build` and `toki watch` cache generated output in `.toki/cache.json` (in the project directory) and skip re-generation when nothing changed:

- **Unchanged input bytes** — the whole pipeline is skipped (~0ms rebuilds).
- **Unchanged resolved token tree** — parse + resolve still run, but transform, generate, and write are skipped (handles cosmetic input differences like whitespace or JSON key order).
- **Changed options** (formats, naming, theme, toki version, or the config file itself) always invalidate the cache and trigger a full rebuild.
- If previously generated output files are missing from disk, the cache treats the build as changed and regenerates them.

A cached run prints `No changes — N tokens up to date (cached)`. Disable the cache per-run with `--no-cache`, per-project with `cache: false` in `toki.config.ts`, or by deleting `.toki/`. The cache file is safe to commit or ignore — it is rebuilt on demand.

## Multi-theme support

Configure multiple themes to generate separate output files per theme:

```ts
const config: TokiConfig = {
  input: './tokens.json',
  output: './dist/tokens',
  themes: {
    light: './tokens/light.json',
    dark: './tokens/dark.json',
  },
  formats: ['css', 'js'],
};
```

Output:

```
dist/tokens/
├── css/
│   ├── tokens.light.css
│   └── tokens.dark.css
└── js/
    ├── tokens.light.js
    ├── tokens.light.d.ts
    ├── tokens.dark.js
    └── tokens.dark.d.ts
```

Build a single theme with `--theme`:

```bash
toki build --theme dark
```

## Naming conventions

| Convention             | Example         | Default for                                |
| ---------------------- | --------------- | ------------------------------------------ |
| `camelCase`            | `colorPrimary`  | JS, React Native, React, Svelte, StencilJS |
| `kebab-case`           | `color-primary` | CSS, Svelte CSS, StencilJS CSS, Tailwind   |
| `CONSTANT_CASE`        | `COLOR_PRIMARY` | Angular, Angular 11                        |
| `SCREAMING_SNAKE_CASE` | `COLOR_PRIMARY` | alias for CONSTANT_CASE                    |

Override per platform in config:

```ts
const config: TokiConfig = {
  input: './tokens.json',
  output: './dist/tokens',
  naming: {
    css: 'kebab-case',
    js: 'CONSTANT_CASE',
  },
};
```

## Custom transform plugins

Register transform functions in config that modify token values before generation. Transforms execute in registration order after built-in platform transforms:

```ts
import type { TokiConfig, TransformPlugin } from 'toki';

const addAlphaChannel: TransformPlugin = (token, context) => {
  if (token.type === 'color' && typeof token.value === 'string' && token.value.length === 7) {
    return { ...token, value: token.value + 'cc' };
  }
  return token;
};

const config: TokiConfig = {
  input: './tokens.json',
  output: './dist/tokens',
  transforms: [addAlphaChannel],
};

export default config;
```

Each transform receives a `ResolvedToken` and a `TransformContext` (with `platform`), and must return a `ResolvedToken`.

## Verbose mode

The `--verbose` flag enables detailed output including config discovery, per-theme processing, token resolution trace, and per-format generation timing:

```bash
toki build --input tokens.json --output ./dist --verbose
```

Example output:

```
toki v0.1.0
  config: discovered
  input:  ./tokens.json
  output: ./dist
  formats: css, js
  collected 3 leaf tokens
  resolved order: color.primary, color.secondary, spacing.small
    resolved "color.primary" (color) → #1a73e8
    resolved "color.secondary" (color) → #1a73e8
    resolved "spacing.small" (dimension) → 8px
  resolved 3 tokens in 2.1ms
Built 5 artifacts from 3 tokens → ./dist
```

## Error handling

Toki reports errors with a stable code prefix and exits non-zero:

```
error [CIRCULAR_REFERENCE_ERROR]: Circular reference detected: color.a → color.b → color.a
error [MISSING_REFERENCE_ERROR]: Token "color.secondary" references unknown token "{color.doesNotExist}".
```

Error codes: `PARSE_ERROR`, `TYPE_ERROR`, `REFERENCE_ERROR`, `CIRCULAR_REFERENCE_ERROR`, `MISSING_REFERENCE_ERROR`, `GENERATOR_ERROR`, `IO_ERROR`, `CONFIG_ERROR`, `IMPORT_ERROR`.
