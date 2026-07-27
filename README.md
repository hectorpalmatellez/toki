<p align="center">
  <img src="./toki.svg" alt="Toki" width="200" />
</p>

# Toki

> Design token pipeline CLI — W3C DTCG in, framework-specific code out.

Toki ingests W3C Design Tokens Community Group (DTCG) format JSON and generates idiomatic, framework-specific code artifacts for eight target platforms: CSS, JavaScript, React Native, Angular (latest + v11), Svelte, React/Next.js, and StencilJS.

## Features

- **W3C DTCG input** — conforms to the [Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/)
- **Reference resolution** — expands `{group.token}` aliases, detects circular dependencies, applies `$type` inheritance
- **Eight output formats** — CSS, JS, React Native, Angular (latest + v11), Svelte, React/Next.js, StencilJS
- **Platform value transforms** — hex normalization, `px`/`rem` → raw dp/sp, RN shadow objects, canonical font weights
- **Configuration file** — `toki.config.ts` (or `.js`) with input, output, formats, themes, naming, and transforms
- **Multi-theme output** — separate output files per theme (e.g., `tokens.light.css`, `tokens.dark.css`)
- **Naming transforms** — `camelCase`, `kebab-case`, `CONSTANT_CASE`, `SCREAMING_SNAKE_CASE`
- **Custom transform plugins** — register functions in config that modify token values before generation
- **Watch mode** — `toki watch` rebuilds on file change with 200ms debounce
- **Diff tooling** — `toki diff` reports added, removed, and changed tokens (terminal or JSON output)
- **Ecosystem imports** — convert Style Dictionary or Figma Tokens Studio formats to W3C DTCG
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
└── stencil/
```

Run `toki` with no arguments for an interactive menu. Run `toki init` to scaffold a starter project.

## CLI flags

| Flag                        | Description                                                         | Default         |
| --------------------------- | ------------------------------------------------------------------- | --------------- |
| `-i, --input <path>`        | Path to input token file (W3C DTCG JSON)                            | —               |
| `-o, --output <path>`       | Output directory for generated artifacts                            | —               |
| `-f, --format <formats...>` | Output formats (comma- or space-separated; `all` for all platforms) | `css, js`       |
| `-c, --config <path>`       | Path to toki config file                                            | auto-discovered |
| `-t, --theme <name>`        | Build a single theme from multi-theme config                        | all themes      |
| `--clean` / `--no-clean`    | Clean subdirectories before writing                                 | `true`          |
| `--verbose`                 | Print resolution trace, values, and timing                          | `false`         |

## Documentation

| Guide                                | Description                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| [Usage Guide](docs/usage.md)         | Detailed CLI commands, config file, multi-theme, naming, plugins, verbose mode, error codes |
| [Output Guide](docs/output.md)       | Input format (W3C DTCG), output conventions, code examples for all 8 platforms              |
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
| Testing         | Vitest (294 tests, 90%+ coverage)                 |
| Linting         | oxlint                                            |
| Formatting      | Prettier                                          |
| Package manager | pnpm 10.32.1                                      |

## License

[MIT](./LICENSE) © Héctor Palma Téllez
