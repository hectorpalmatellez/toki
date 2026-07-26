# Toki

> Design token pipeline CLI — W3C DTCG in, framework-specific code out.

Toki ingests W3C Design Tokens Community Group (DTCG) format JSON and generates idiomatic, framework-specific code artifacts for six target platforms: CSS, JavaScript, React Native, Angular (latest + v11), Svelte, and React/Next.js.

## Status

**Phase 2 (Multi-Platform) complete.**

`toki build` parses W3C DTCG tokens, resolves `{group.token}` references (with circular-dependency detection), applies `$type` inheritance, transforms values per platform, and generates deterministic artifacts for all seven output formats: CSS, JavaScript, React Native, Angular (latest + v11), Svelte, and React/Next.js. Config file support, multi-theme output, and ecosystem tooling are tracked in [`docs/backlog.md`](./docs/backlog.md). Completed tasks are recorded in [`docs/done.md`](./docs/done.md).

## Features

- **W3C DTCG input** — conforms to the [Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/).
- **Reference resolution** — expands `{group.token}` aliases and detects circular dependencies.
- **`$type` inheritance** — group-level types propagate to child tokens unless overridden.
- **Seven output formats** — one input, idiomatic output per platform: CSS, JS, React Native, Angular (latest + v11), Svelte, React/Next.js.
- **Platform value transforms** — hex normalization, `px`/`rem` → raw dp/sp numbers for React Native, RN shadow objects, canonical font weights.
- **Deterministic output** — same input produces byte-identical artifacts.
- **Zero runtime dependencies** — generated files never import from toki.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 LTS |
| Language | TypeScript 5.8+ (strict) |
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
pnpm build        # tsup bundle → dist/
pnpm dev          # tsup --watch
```

### Run

```bash
# Generate CSS + JS (default formats) from a W3C DTCG token file:
toki build \
  --input tokens.json \
  --output ./dist \
  --format css,js

# Generate every platform in one run:
toki build --input tokens.json --output ./dist --format all

# Generate CSS only, without clearing pre-existing output first:
toki build --input tokens.json --output ./dist --format css --no-clean
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
| `--clean` / `--no-clean` | Clean the target platform subdirectories before writing | `true` |
| `--verbose` | Print input/output/formats and resolution summary | `false` |

### Errors

Toki reports errors with a stable code prefix and exits non-zero:

```
error [CIRCULAR_REFERENCE_ERROR]: Circular reference detected: color.a → color.b → color.a
error [MISSING_REFERENCE_ERROR]: Token "color.secondary" references unknown token "{color.doesNotExist}".
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
pnpm test:watch   # vitest
pnpm test:coverage # vitest run --coverage
pnpm build        # tsup
pnpm dev          # tsup --watch
pnpm clean        # rm -rf dist
```

## Architecture

```
src/
├── cli.ts                 # Commander.js entry point
├── index.ts               # Barrel export
├── core/
│   ├── types.ts           # Core type definitions
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
    ├── naming.ts          # camelCase, kebab-case, etc.
    ├── format.ts          # Value formatting helpers
    └── errors.ts          # Custom error classes
```

## Roadmap

See [`docs/backlog.md`](./docs/backlog.md) for the phased roadmap:

- **Phase 1 — Foundation:** parser, resolver, CSS + JS generators, CLI ✅
- **Phase 2 — Multi-Platform:** transformers, RN, Angular (latest + v11), Svelte, React/Next.js ✅
- **Phase 3 — Config & Multi-Theme:** config file, naming transforms, plugin API
- **Phase 4 — Polish & Ecosystem:** watch mode, diff tooling, imports, JSON schema, CI

## Resources

- [W3C Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/)

## License

[MIT](./LICENSE) © Héctor Palma Téllez