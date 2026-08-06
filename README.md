<p align="center">
  <img src="./toki.svg" alt="Toki" width="200" />
</p>

# Toki

> Design token pipeline CLI — W3C DTCG in, framework-specific code out.

Toki ingests W3C Design Tokens Community Group (DTCG) format JSON and generates idiomatic, framework-specific code artifacts for ten target platforms: CSS, JavaScript, React Native, Angular (latest + v11), Svelte, React/Next.js, StencilJS, Vue, and Tailwind CSS v4.

## Features

- **W3C DTCG input** — conforms to the [Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/)
- **Reference resolution** — expands `{group.token}` aliases, detects circular dependencies, applies `$type` inheritance
- **Ten output formats** — CSS, JS, React Native, Angular (latest + v11), Svelte, React/Next.js, StencilJS, Vue, Tailwind CSS v4
- **Platform value transforms** — hex normalization, `px`/`rem` → raw dp/sp, RN shadow objects, canonical font weights
- **Configuration file** — `toki.config.ts` (or `.js`) with input, output, formats, themes, naming, and transforms
- **Multi-theme output** — separate output files per theme (e.g., `tokens.light.css`, `tokens.dark.css`)
- **Naming transforms** — `camelCase`, `kebab-case`, `CONSTANT_CASE`, `SCREAMING_SNAKE_CASE`
- **Custom transform plugins** — register functions in config that modify token values before generation
- **Watch mode** — `toki watch` rebuilds on file change with 200ms debounce
- **Incremental build cache** — two-tier SHA-256 cache skips parse/resolve/generate for unchanged inputs (`--no-cache` to disable)
- **Parallel generator execution** — selected platforms generate concurrently, with deterministic output ordering
- **Composite type expansion** — typography, border, and transition tokens expand into individual CSS longhand custom properties across all CSS-based generators
- **Diff tooling** — `toki diff` reports added, removed, and changed tokens (terminal, JSON, or Markdown output)
- **Token linting** — `toki validate` checks structural validity, broken references, circular dependencies, naming violations, and more
- **Ecosystem imports** — convert Style Dictionary or Figma Tokens Studio formats to W3C DTCG
- **MCP server** — `toki mcp` exposes the full pipeline to AI tools (Claude, Cursor, Windsurf) via 7 tools, 3 resources, 1 dynamic resource, and 3 prompts over Model Context Protocol
- **Web editor** — `toki ui` starts a local web app for non-technical users to create base tokens with friendly forms (color pickers, unit dropdowns, typography styles) and generate code for any supported framework
- **Token extraction** — scan CSS/SCSS files to extract design token candidates and generate W3C DTCG output
- **Output schemas** — `toki schema` publishes a JSON Schema per platform output format for IDE autocomplete on generated files
- **Editor completions** — `toki completions` generates editor-agnostic, VS Code snippet, and LSP completion specs from resolved tokens
- **Deterministic output** — same input produces byte-identical artifacts
- **Zero runtime dependencies** in generated files

## Quick start

### Global Installation

```bash
npm i -g @hectorpalmatellez/toki
```

### Local Development

```bash
pnpm install
toki build --input tokens.json --output ./dist --format css,js
```

Output:

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
├── angular/
├── angular-11/
├── svelte/
├── react/
├── stencil/
├── vue/
└── tailwind/
```

Run `toki` with no arguments for an interactive menu. Run `toki init` to scaffold a starter project.

### Web editor (`toki ui`)

Start a local web app that lets anyone — no CLI or JSON experience needed — create base tokens and generate them for any supported framework:

```bash
toki ui
```

- Opens `http://127.0.0.1:4173` in your browser automatically (use `--no-open` to skip).
- Friendly forms per token type: color pickers, unit dropdowns (`px`/`rem`/`em`/`%`), typography styles, shadows, borders, and transitions. References like `{color.primary}` are supported.
- Edits `tokens.json` in the current directory; every save validates and rebuilds automatically.
- Picks up formats and the output directory from `toki.config.ts` when present; your UI choices are remembered in `.toki/ui.json`.
- Flags: `--port <n>`, `--host <ip>`, `--no-open`, `--verbose`.

## CLI flags

| Flag                        | Description                                                                                       | Default         |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------- |
| `-i, --input <path>`        | Path to input token file (W3C DTCG JSON)                                                          | —               |
| `-o, --output <path>`       | Output directory for generated artifacts (relative to the current directory, or an absolute path) | —               |
| `-f, --format <formats...>` | Output formats (comma- or space-separated; `all` for all platforms)                               | `css, js`       |
| `-c, --config <path>`       | Path to toki config file                                                                          | auto-discovered |
| `-t, --theme <name>`        | Build a single theme from multi-theme config                                                      | all themes      |
| `--clean` / `--no-clean`    | Clean subdirectories before writing                                                               | `true`          |
| `--no-cache`                | Disable the incremental build cache                                                               | enabled         |
| `--verbose`                 | Print resolution trace, values, and timing                                                        | `false`         |

## Documentation

| Guide                                | Description                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| [Usage Guide](docs/usage.md)         | Detailed CLI commands, config file, multi-theme, naming, plugins, verbose mode, error codes |
| [MCP Guide](docs/mcp.md)             | AI agent integration — `toki mcp` setup, tools, examples                                    |
| [Output Guide](docs/output.md)       | Input format (W3C DTCG), output conventions, code examples for all 10 platforms             |
| [Architecture](docs/architecture.md) | Pipeline design, source tree, key design decisions                                          |
| [Changelog](CHANGELOG.md)            | Release history following Keep a Changelog                                                  |
| [Roadmap](docs/backlog.md)           | Completed tasks and planned work                                                            |

## Stack

| Layer           | Technology                                        |
| --------------- | ------------------------------------------------- |
| Runtime         | Node.js 24 LTS                                    |
| Language        | TypeScript 7.0+ (native Go compiler, strict mode) |
| CLI             | Commander.js                                      |
| Bundler         | tsup                                              |
| Testing         | Vitest (632 tests, 90%+ coverage)                 |
| Linting         | oxlint                                            |
| Formatting      | Prettier                                          |
| Package manager | pnpm 10.32.1                                      |

## License

[MIT](./LICENSE) © Héctor Palma Téllez
