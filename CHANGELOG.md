# Changelog

All notable changes to Toki will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
