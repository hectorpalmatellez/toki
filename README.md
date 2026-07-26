<p align="center">
  <img src="./toki.svg" alt="Toki" width="200" />
</p>

# Toki

> Design token pipeline CLI — W3C DTCG in, framework-specific code out.

Toki ingests W3C Design Tokens Community Group (DTCG) format JSON and generates idiomatic, framework-specific code artifacts for six target platforms: CSS, JavaScript, React Native, Angular (latest + v11), Svelte, and React/Next.js.

## Status

**Phase 4 (Polish & Ecosystem) complete.**

Toki is a production-ready design token pipeline. `toki build` parses W3C DTCG tokens, resolves `{group.token}` references (with circular-dependency detection), applies `$type` inheritance, transforms values per platform, and generates deterministic artifacts for all seven output formats. Watch mode, diff tooling, ecosystem imports, JSON Schema, CI workflows, and benchmark infrastructure are all implemented. Completed tasks are recorded in [`docs/done.md`](./docs/done.md).

## Features

- **W3C DTCG input** — conforms to the [Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/).
- **Reference resolution** — expands `{group.token}` aliases and detects circular dependencies.
- **`$type` inheritance** — group-level types propagate to child tokens unless overridden.
- **Seven output formats** — one input, idiomatic output per platform: CSS, JS, React Native, Angular (latest + v11), Svelte, React/Next.js.
- **Platform value transforms** — hex normalization, `px`/`rem` → raw dp/sp numbers for React Native, RN shadow objects, canonical font weights.
- **Configuration file** — `toki.config.ts` (or `.js`) with input, output, formats, themes, naming, and transforms.
- **Multi-theme output** — config-driven theme mapping produces separate output files per theme (e.g., `tokens.light.css`, `tokens.dark.css`).
- **Naming transforms** — configurable per platform: `camelCase`, `kebab-case`, `CONSTANT_CASE`, `SCREAMING_SNAKE_CASE`.
- **Custom transform plugins** — register functions in config that modify token values before generation.
- **Verbose debug mode** — `--verbose` prints resolution trace, per-token values, and generation timing.
- **Deterministic output** — same input produces byte-identical artifacts.
- **Zero runtime dependencies** — generated files never import from toki.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 LTS |
| Language | TypeScript 7.0+ (native Go compiler, strict) |
| CLI | Commander.js |
| Bundler | tsup |
| Testing | Vitest |
| Linting | oxlint |
| Formatting | Prettier |
| Package manager | pnpm 10.32.1 |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build        # tsup bundle + .d.ts → dist/
pnpm dev          # tsup --watch
```

### Run

```bash
# Initialize a starter project with sample tokens and config:
toki init

# Generate CSS + JS (default formats) from a W3C DTCG token file:
toki build \
  --input tokens.json \
  --output ./dist \
  --format css,js

# Generate every platform in one run:
toki build --input tokens.json --output ./dist --format all

# Generate CSS only, without clearing pre-existing output first:
toki build --input tokens.json --output ./dist --format css --no-clean

# Use a config file (auto-discovered or specify path):
toki build
toki build --config ./my-config.ts

# Build a specific theme from multi-theme config:
toki build --theme dark

# Verbose mode with resolution trace and timing:
toki build --input tokens.json --output ./dist --verbose
```

Output is written under platform subdirectories (each with its own README):

```
dist/
├── css/
│   ├── tokens.css
│   └── README.md
├── js/
│   ├── tokens.js
│   ├── tokens.d.ts
│   └── README.md
├── react-native/
│   ├── tokens.js        # values grouped by category (raw dp/sp numbers)
│   ├── styles.js        # StyleSheet.create() helpers
│   └── README.md
├── angular/
│   ├── _tokens.scss     # $kebab-case variables (@use-ready)
│   ├── tokens.scss      # @use entry + :root custom properties
│   ├── tokens.ts        # CONSTANT_CASE exports
│   ├── tokens.module.ts # InjectionToken<DesignTokens> + provider
│   └── README.md
├── angular-11/
│   ├── _tokens.scss     # @import-compatible only
│   ├── tokens.scss
│   ├── tokens.ts
│   └── README.md
├── svelte/
│   ├── tokens.css       # :root custom properties (scoped <style> friendly)
│   ├── tokens.ts        # camelCase ES module
│   └── README.md
└── react/
    ├── theme.ts         # nested theme object `as const` + Theme type
    ├── tokens.css       # companion custom properties for next-themes
    └── README.md
```

| Flag | Description | Default |
|---|---|---|
| `-i, --input <path>` | Path to input token file (W3C DTCG JSON) | — |
| `-o, --output <path>` | Output directory for generated artifacts | — |
| `-f, --format <formats...>` | Output formats (comma- or space-separated; `all` for every platform) | `["css", "js"]` |
| `-c, --config <path>` | Path to toki config file | auto-discovered |
| `-t, --theme <name>` | Build a single theme from multi-theme config | all themes |
| `--clean` / `--no-clean` | Clean the target platform subdirectories before writing | `true` |
| `--verbose` | Print resolution trace, per-token values, and timing | `false` |

### JSON Schema

Toki publishes a [JSON Schema](schema/toki-input.json) for W3C DTCG input files. If your editor supports JSON Schema (VS Code, JetBrains, etc.), you get autocompletion and validation:

```json
{
  "$schema": "https://toki.design/schema/toki-input.json",
  "color": {
    "$type": "color",
    "primary": { "$value": "#1a73e8" }
  }
}
```

### Errors

Toki reports errors with a stable code prefix and exits non-zero:

```
error [CIRCULAR_REFERENCE_ERROR]: Circular reference detected: color.a → color.b → color.a
error [MISSING_REFERENCE_ERROR]: Token "color.secondary" references unknown token "{color.doesNotExist}".
```

## Configuration file

Toki can be configured via a `toki.config.ts` (or `.js` / `.mjs`) file in your project root. When present, `toki build` auto-discovers the config and uses it as the default for all options.

**Discovery order:** `--config` flag → `toki.config.ts` → `toki.config.js` → `toki.config.mjs`

CLI flags override config file values.

```ts
// toki.config.ts
import type { TokiConfig } from "toki";

const config: TokiConfig = {
  input: "./tokens.json",
  output: "./dist/tokens",
  formats: ["css", "js", "react-native"],
  clean: true,
};

export default config;
```

### Config schema

| Field | Type | Default | Description |
|---|---|---|---|
| `input` | `string \| string[]` | — | Input token file path(s) (required) |
| `output` | `string` | — | Output directory (required) |
| `formats` | `OutputFormat[]` | `["css", "js"]` | Output formats to generate |
| `themes` | `Record<string, string>` | — | Theme name → token file mapping for multi-theme builds |
| `naming` | `Record<OutputFormat, NamingConvention>` | per-platform defaults | Per-format naming convention overrides |
| `transforms` | `TransformPlugin[]` | `[]` | Custom transform functions applied after built-in transforms |
| `clean` | `boolean` | `true` | Clean output subdirectories before writing |

## Multi-theme support

Configure multiple themes to generate separate output files per theme:

```ts
// toki.config.ts
import type { TokiConfig } from "toki";

const config: TokiConfig = {
  input: "./tokens.json",
  output: "./dist/tokens",
  themes: {
    light: "./tokens/light.json",
    dark: "./tokens/dark.json",
  },
  formats: ["css", "js"],
};

export default config;
```

Running `toki build` with this config produces:

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

Toki supports four naming conventions for token identifiers:

| Convention | Example | Default for |
|---|---|---|
| `camelCase` | `colorPrimary` | JS, React Native, React, Svelte |
| `kebab-case` | `color-primary` | CSS, Svelte CSS |
| `CONSTANT_CASE` | `COLOR_PRIMARY` | Angular, Angular 11 |
| `SCREAMING_SNAKE_CASE` | `COLOR_PRIMARY` | alias for CONSTANT_CASE |

Override per platform in config:

```ts
const config: TokiConfig = {
  input: "./tokens.json",
  output: "./dist/tokens",
  naming: {
    css: "kebab-case",
    js: "CONSTANT_CASE",
    react: "camelCase",
  },
};
```

## Custom transform plugins

Register transform functions in config that modify token values before generation. Transforms execute in registration order after built-in platform transforms:

```ts
import type { TokiConfig, TransformPlugin } from "toki";

const addAlphaChannel: TransformPlugin = (token, context) => {
  if (token.type === "color" && typeof token.value === "string" && token.value.length === 7) {
    return { ...token, value: token.value + "cc" }; // 80% opacity
  }
  return token;
};

const config: TokiConfig = {
  input: "./tokens.json",
  output: "./dist/tokens",
  transforms: [addAlphaChannel],
};

export default config;
```

Each transform receives a `ResolvedToken` and a `TransformContext` (with `platform`), and must return a `ResolvedToken`.

## Verbose mode

The `--verbose` flag enables detailed output including:

- Config file discovery
- Per-theme processing
- Token resolution trace (collection order, resolved values)
- Per-format generation timing

```bash
toki build --input tokens.json --output ./dist --verbose
```

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

## Input format (W3C DTCG)

```json
{
  "color": {
    "$type": "color",
    "primary": {
      "$value": "#1a73e8",
      "$description": "Primary brand color"
    },
    "secondary": {
      "$value": "{color.primary}",
      "$description": "Alias to primary"
    }
  },
  "spacing": {
    "$type": "dimension",
    "small": { "$value": "8px" },
    "medium": { "$value": "16px" }
  }
}
```

Supported `$type` values: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `lineHeight`, `letterSpacing`, `shadow`, `typography`, `border`, `transition`.

Reference syntax: `{group.token}` → resolves to the referenced token's `$value`.

## Output conventions

Generated artifacts:

- Carry a header comment: `/* Generated by toki v{version} — do not edit */`
- Are deterministic (byte-identical for identical input)
- Have no runtime dependencies on toki

Platform conventions:

- **CSS** — `:root` selector with `--kebab-case` custom properties
- **JavaScript** — `export const camelCase` named exports + `.d.ts` declarations
- **React Native** — values grouped by category (`colors`, `spacing`, …), raw numbers for dimensions (dp / sp), `StyleSheet.create()` helper file
- **Angular (latest)** — SCSS variables consumed via `@use`, TypeScript `CONSTANT_CASE`, `InjectionToken<DesignTokens>` module for DI
- **Angular 11** — SCSS `@import` only (no `@use`/`@forward`), TypeScript `CONSTANT_CASE`, no `InjectionToken` module
- **Svelte** — `:root` CSS custom properties (cascade through scoped `<style>` blocks) + `camelCase` ES module
- **React / Next.js** — nested theme object exported `as const` (CSS-in-JS and Tailwind `theme.extend` compatible) + companion CSS for `next-themes`

## Output examples

Given this input (`tokens.json`):

```json
{
  "color": {
    "$type": "color",
    "primary": { "$value": "#1a73e8", "$description": "Primary brand color" },
    "secondary": { "$value": "{color.primary}" }
  },
  "spacing": {
    "$type": "dimension",
    "small": { "$value": "8px" },
    "medium": { "$value": "16px" }
  },
  "font": {
    "$type": "fontFamily",
    "sans": { "$value": "Inter, sans-serif" }
  }
}
```

Running `toki build --input tokens.json --output ./dist --format css,js` produces:

**`dist/css/tokens.css`** — `:root` block with `--kebab-case` properties
(references are expanded: `--color-secondary` resolves to `#1a73e8`):

```css
/* Generated by toki v0.1.0 — do not edit */

:root {
  --color-primary: #1a73e8;
  --color-secondary: #1a73e8;
  --spacing-small: 8px;
  --spacing-medium: 16px;
  --font-sans: Inter, sans-serif;
}
```

**`dist/js/tokens.js`** — `export const` camelCase named exports:

```js
/* Generated by toki v0.1.0 — do not edit */

export const colorPrimary = "#1a73e8";
export const colorSecondary = "#1a73e8";
export const spacingSmall = "8px";
export const spacingMedium = "16px";
export const fontSans = "Inter, sans-serif";
```

**`dist/js/tokens.d.ts`** — companion type declarations:

```ts
/* Generated by toki v0.1.0 — do not edit */

export declare const colorPrimary: string;
export declare const colorSecondary: string;
export declare const spacingSmall: string;
export declare const spacingMedium: string;
export declare const fontSans: string;
```

With `--format react-native,angular,svelte,react` the same input also produces:

**`dist/react-native/tokens.js`** — grouped by category, dimensions as raw dp/sp numbers:

```js
/* Generated by toki v0.1.0 — do not edit */

export const colors = {
  primary: "#1a73e8",
  secondary: "#1a73e8",
};

export const spacing = {
  small: 8,
  medium: 16,
};

export const fonts = {
  sans: "Inter",
};
```

**`dist/angular/_tokens.scss`** — SCSS variables, plus `tokens.ts` (`CONSTANT_CASE`) and `tokens.module.ts` (`InjectionToken<DesignTokens>`):

```scss
/* Generated by toki v0.1.0 — do not edit */

$color-primary: #1a73e8;
$color-secondary: #1a73e8;
$spacing-small: 8px;
$spacing-medium: 16px;
$font-sans: Inter, sans-serif;
```

**`dist/svelte/tokens.ts`** — ES module (plus a `tokens.css` mirroring the CSS format):

```ts
/* Generated by toki v0.1.0 — do not edit */

export const colorPrimary = "#1a73e8";
export const colorSecondary = "#1a73e8";
export const spacingSmall = "8px";
export const spacingMedium = "16px";
export const fontSans = "Inter, sans-serif";
```

**`dist/react/theme.ts`** — nested theme object (plus `tokens.css` for `next-themes`):

```ts
/* Generated by toki v0.1.0 — do not edit */

export const theme = {
  colors: {
    primary: "#1a73e8",
    secondary: "#1a73e8",
  },
  spacing: {
    small: "8px",
    medium: "16px",
  },
  fonts: {
    sans: "Inter, sans-serif",
  },
} as const;

export type Theme = typeof theme;

export default theme;
```

## Pipeline architecture

```
Parse → Resolve → Transform → Generate → Write
```

- **Parser** — reads W3C DTCG JSON, validates structure, produces a `TokenTree`
- **Resolver** — expands `{group.token}` references, detects circular dependencies, applies `$type` inheritance
- **Transform** — converts raw values to platform-specific formats (hex → rgb, px → rem/sp/dp)
- **Generator registry** — each platform is an isolated module: `(tokens, config) => OutputArtifact[]`
- **Writer** — writes artifacts to disk, generates a checksum manifest

## Commands

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # oxlint src/
pnpm lint:fix     # oxlint src/ --fix
pnpm format       # prettier --write 'src/**/*.ts'
pnpm format:check # prettier --check 'src/**/*.ts'
pnpm test         # vitest run
pnpm bench        # vitest bench  (performance benchmarks)
pnpm test:watch   # vitest
pnpm test:coverage # vitest run --coverage
pnpm build        # tsup + build:types (bundling + .d.ts generation)
pnpm dev          # tsup --watch
pnpm clean        # rm -rf dist
```

## Architecture

```
src/
├── cli.ts                 # Commander.js entry point (build, init)
├── index.ts               # Barrel export
├── core/
│   ├── types.ts           # Core type definitions
│   ├── config.ts          # Config file discovery, loading, validation
│   ├── parser.ts          # JSON → TokenTree
│   ├── resolver.ts        # Reference expansion + cycle detection
│   ├── transformer.ts    # Value transformation registry
│   └── pipeline.ts        # Orchestrates parse → resolve → transform → generate
├── generators/
│   ├── css.ts
│   ├── js.ts
│   ├── react-native.ts
│   ├── angular.ts
│   ├── angular-11.ts
│   ├── svelte.ts
│   ├── react.ts
│   └── index.ts           # Generator registry
└── utils/
    ├── naming.ts          # camelCase, kebab-case, CONSTANT_CASE, etc.
    ├── grouping.ts        # Category grouping + JS object-literal serialization
    ├── format.ts          # Value formatting + theme path helpers
    ├── writer.ts          # Disk I/O for artifacts
    └── errors.ts          # Custom error classes
```

## Roadmap

See [`docs/backlog.md`](./docs/backlog.md) for the phased roadmap:

- **Phase 1 — Foundation:** parser, resolver, CSS + JS generators, CLI ✅
- **Phase 2 — Multi-Platform:** transformers, RN, Angular (latest + v11), Svelte, React/Next.js ✅
- **Phase 3 — Config & Multi-Theme:** config file, naming transforms, plugin API, verbose mode ✅
- **Phase 4 — Polish & Ecosystem:** watch mode, diff tooling, imports, JSON schema, CI ✅

## Resources

- [W3C Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/)

## License

[MIT](./LICENSE) © Héctor Palma Téllez