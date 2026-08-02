# Changelog

All notable changes to Toki will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] — 2026-08-02

### Changed

- **Dependency upgrade pass** — `vitest`/`@vitest/coverage-v8` 3.2 → 4.1, `commander` 13 → 15, `oxlint` 1.6 → 1.76, `jiti` 2.4 → 2.7, `prettier` 3.5 → 3.9, `@modelcontextprotocol/sdk` 1.29 → 1.30, `tsup` → 8.5.1. `build:types` now uses `typescript@7.0.2` (was pinned to 6.0.3), matching the devDependency.
- **Vitest 4 coverage config** — `coverage` moved to the top level of `vitest.config.ts`; the v8 provider counts more branch points (83.31% → 78.08% on identical code), so the branch threshold was recalibrated from 80 to 75.
- **`pnpm bench`** — Vitest 4's bench mode only matches `*.bench.*` globs, so the script now runs the timing suite directly (`vitest run src/core/benchmark.test.ts`).
- **Prettier 3.6+ formatting** — 25 files re-formatted to the current defaults.

## [1.8.3] — 2026-08-02

### Fixed

- **`toki ui` "Add" button labels** — the button in the Font Families section read "Add font familie" because the singularization only stripped a trailing `s`. Labels now use proper plural handling (`families` → `family`), so every group shows a correctly singularized "Add <token type>" button.

## [1.8.2] — 2026-08-02

### Fixed

- **`toki ui` crash on boot** — the DOM helper used `getElementById()` on selectors like `#status`, which always returned `null` and crashed the editor with `Missing element ##status`. The helper now strips the leading `#`. Added happy-dom boot tests that load the real `index.html` and drive `init()` against stubbed API responses.

## [1.8.1] — 2026-08-02

### Fixed

- **Installability of the published package** — `package.json` pinned `@clack/prompts` to `^1.8.0`, a version that was never published (latest is `1.7.0`), causing `ETARGET` errors for every downstream install. The range is now `^1.7.0`.

## [1.8.0] — 2026-08-01

### Added

- **`toki ui`** — friendly web editor mode for non-technical users. Starts a local server (default `http://127.0.0.1:4173`, browser auto-open, zero new runtime dependencies) with a zero-framework web app that:
  - Edits `tokens.json` through per-type structured forms — color pickers, unit dropdowns (`px`/`rem`/`em`/`%`), typography/font/duration/line-height/letter-spacing fields, cubic Béziers, and simplified forms for composite `shadow`, `border`, and `transition` tokens (raw editors for references like `{color.primary}`).
  - Loads an existing `tokens.json` or scaffolds the sample set, validates on save (parser + `toki validate` rules), auto-builds every save, and previews the generated artifacts per framework with a manual "Build only" button.
  - Resolves formats and the output directory from `toki.config.ts` when present; UI choices persist to `.toki/ui.json`.
  - Ships as `dist/ui/` static assets (bundled `app.js` + `index.html` + `styles.css`), type-checked with a dedicated DOM-lib tsconfig.
- **`toki ui --port <n> / --host <ip> / --no-open / --verbose`** CLI flags; `ui` entry in the interactive menu.

## [1.7.0] — 2026-08-01

### Added

- **`toki schema`** — publishes a draft-07 JSON Schema per platform output format describing the JSON view of the generated artifacts for the resolved token set (custom-property maps for CSS/Tailwind, named exports for JS/Angular/Svelte/Vue, grouped categories for React Native/React/Stencil). Properties mirror each generator's naming (`--color-primary`, `colorPrimary`, `COLOR_PRIMARY`, `colors.brand.primary`) with typed values and `additionalProperties: false` — wire into VS Code `json.schemas` for autocomplete and validation.
- **`toki completions`** — generates editor completion specs from resolved tokens: an editor-agnostic `spec.json`, a VS Code `tokens.code-snippets` file, and an LSP `tokens.lsp.json` (`CompletionItem[]`). Every entry includes the dotted token id, type, resolved value, description, `--kebab-case` CSS variable, and camelCase identifier, inserting the canonical `var(--color-primary)` reference.

## [1.6.0] — 2026-08-01

### Added

- **Parallel generator execution** — `Generator.generate` is now async; selected formats run concurrently via `Promise.all` after the Transform stage, with deterministic artifact ordering. Future plugin generators slot into the same path.
- **Incremental build cache** — SHA-256 two-tier cache (raw input bytes + resolved token tree) persisted at `.toki/cache.json`. Unchanged builds skip parse/generate/write entirely (~0 ms rebuilds in `toki watch`); changed options (formats, naming, theme, config file) always invalidate. Disable with `--no-cache` or `cache: false` in `toki.config.ts`. MCP `build_tokens` reports `cached`.

## [1.5.0] — 2026-07-27

### Added

- **Composite type expansion (CSS)** — `typography`, `border`, and `transition` tokens now expand into individual CSS longhand custom properties (e.g., `--typography-heading-h1-font-size: 32px`) instead of being silently skipped. Flows through all CSS-based generators (CSS, Vue, Svelte, Stencil, React companion CSS, Angular SCSS, Tailwind).
- **`toki validate`** — standalone linter CLI command. Checks structural validity, broken references, circular dependencies, missing descriptions, naming convention violations, and duplicate values. Supports `--json` and `--strict` flags.
- **`toki diff --markdown`** — GitHub-compatible Markdown diff output. Produces tables for added, removed, and changed tokens, ready for PR comments. Also available via MCP `diff_tokens` tool with `output: "markdown"`.

## [1.4.1] — 2026-07-27

### Added

- **MCP dynamic resource** — `toki://tokens/{+input}` exposes the fully resolved token list for any W3C DTCG file as a parameterized MCP resource. AI editors can read tokens as context without a tool call.

### Changed

- **Parallel write pipeline** — `writeArtifacts()` now writes all output files concurrently via `Promise.all` instead of sequentially. The `generate()` function uses `.map().flat()` instead of a `for...of` loop, expressing per-format independence explicitly.

## [1.4.0] — 2026-07-27

### Added

- **Tailwind CSS v4 generator** — tenth platform target emitting `tailwind/tokens.css` (`@theme` block with namespace-mapped CSS custom properties) and `tailwind/README.md`. Token types map to Tailwind namespaces: `color` → `--color-*`, `dimension` → `--spacing-*`, `fontWeight` → `--font-weight-*`, etc. Composite types (`typography`, `border`, `transition`, `shadow`) are skipped.
- **MCP Resources** — three static resources: `toki://formats` (supported formats metadata), `toki://token-types` (W3C DTCG type reference), `toki://w3c-dtcg-spec` (format quick reference). Server now declares `resources` capability.
- **MCP Prompts** — three prompt templates: `migrate-css-tokens` (CSS-to-Toki migration), `validate-tokens` (quality audit), `preview-all-formats` (cross-platform preview). Server now declares `prompts` capability.

### Fixed

- **MCP documentation** — updated `docs/mcp.md` to include `vue` and `tailwind` in format listings and example output.

## [1.3.0] — 2026-07-27

### Added

- **Vue generator** — ninth platform target emitting `vue/tokens.css` (`:root` CSS custom properties compatible with scoped `<style>` blocks), `vue/tokens.ts` (camelCase ES module exports), and `vue/README.md`. Registered in `OutputFormat`, `ALL_FORMATS`, the generator registry, `DEFAULT_NAMING`, and the `"all"` format expansion.

## [1.1.0] — 2026-07-26

### Added

- **StencilJS generator** — eighth platform target emitting `stencil/tokens.css`, `stencil/tokens.ts` (camelCase exports + grouped `tokens` object), `stencil/tokens.d.ts`, `stencil/types.ts` (per-category union types + full `TokenName` union for type-safe `@Prop()` decorators), and `stencil/README.md`. Registered in `OutputFormat`, `ALL_FORMATS`, the generator registry, `DEFAULT_NAMING`, and the `"all"` format expansion.

## [1.0.1] — 2026-07-26

### Changed

- **Re-scoped package** to `@hectorpalmatellez/toki` — CLI binary unchanged (`toki`)
- **Updated repository URLs** to `github.com/hectorpalmatellez/toki`
- **Removed CI/CD workflows** (`.github/`) — project uses manual verification
- **Cleaned up docs** — `docs/done.md` reflects removed CI tasks

## [1.0.0] — 2026-07-26

### Added

- **Parser** — reads W3C DTCG JSON, validates structure, produces normalized `TokenTree`
- **Resolver** — expands `{group.token}` references, detects circular dependencies, applies `$type` inheritance
- **Transformer** — platform-specific value transforms (hex normalization, `px`→`dp`, shadow objects, font weights)
- **CSS generator** — `:root` block with `--kebab-case` custom properties
- **JS generator** — `export const camelCase` named exports + `.d.ts` declarations
- **React Native generator** — `tokens.js` (grouped by category) + `styles.js` (`StyleSheet.create()`)
- **Angular latest generator** — `_tokens.scss` (`@use`-ready) + `tokens.ts` + `tokens.module.ts` (`InjectionToken`)
- **Angular 11 generator** — `@import`-compatible SCSS (no `@use`/`@forward`), no `InjectionToken` module
- **Svelte generator** — `tokens.css` + `tokens.ts` (camelCase ES module)
- **React/Next.js generator** — nested `theme.ts` object (CSS-in-JS / Tailwind) + companion `tokens.css`
- **Per-platform READMEs** — each output subdirectory includes usage docs
- **CLI commands** — `toki build`, `toki init`, `toki watch`, `toki diff`, `toki import`
- **Configuration file** — `toki.config.ts` (or `.js`) with `jiti` loading
- **Multi-theme support** — config-driven theme mapping produces separate output files per theme
- **Naming transforms** — four conventions: `camelCase`, `kebab-case`, `CONSTANT_CASE`, `SCREAMING_SNAKE_CASE`
- **Custom transform plugins** — register functions in config that modify tokens before generation
- **Verbose debug mode** — `--verbose` prints resolution trace, values, and timing
- **Import from Style Dictionary** — `toki import --from style-dictionary`
- **Import from Figma Tokens Studio** — `toki import --from figma-tokens`
- **JSON Schema** — `schema/toki-input.json` for IDE autocomplete and validation
- **Benchmark suite** — performance measurements for 500, 1000, and 5000 token sets
- **npm publish setup** — `bin`, `files`, `prepublishOnly` script, `.npmignore`
- **Interactive TUI mode** — running `toki` with no arguments opens an interactive menu
- **Community documentation** — CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- **README refactor** — split into focused docs: `docs/usage.md`, `docs/output.md`, `docs/architecture.md`

[1.0.0]: https://github.com/hectorpalmatellez/toki/releases/tag/v1.0.0
