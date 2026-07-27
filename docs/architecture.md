# Toki — Architecture

## Pipeline

Toki uses a linear pipeline with registry-based generators:

```
Parse → Resolve → Transform → Generate → Write
```

| Stage         | Module            | Responsibility                                                                                 |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| **Parse**     | `parser.ts`       | Reads W3C DTCG JSON, validates structure, produces a `TokenTree`                               |
| **Resolve**   | `resolver.ts`     | Expands `{group.token}` references, detects circular dependencies, applies `$type` inheritance |
| **Transform** | `transformer.ts`  | Converts raw values to platform-specific formats (hex → rgb, px → rem/dp)                      |
| **Generate**  | `generators/*.ts` | Each platform is an isolated module: `(tokens, config) => OutputArtifact[]`                    |
| **Write**     | `writer.ts`       | Writes artifacts to disk, generates a checksum manifest                                        |

## Source tree

```
src/
├── cli.ts                 # Commander.js entry point
├── index.ts               # Barrel export for library use
├── tui.ts                 # Interactive TUI mode
├── core/
│   ├── types.ts           # Core type definitions
│   ├── config.ts          # Config file discovery, loading, validation
│   ├── parser.ts          # JSON → TokenTree
│   ├── resolver.ts        # Reference expansion + cycle detection
│   ├── transformer.ts     # Value transformation registry
│   ├── pipeline.ts        # Orchestrates parse → resolve → transform → generate
│   ├── diff.ts            # Token diffing for `toki diff`
│   └── watch.ts           # File system watcher for `toki watch`
├── generators/
│   ├── index.ts           # Generator registry (8 platforms)
│   ├── css.ts
│   ├── js.ts
│   ├── react-native.ts
│   ├── angular.ts
│   ├── angular-11.ts
│   ├── svelte.ts
│   ├── react.ts
│   ├── stencil.ts
│   └── readme.ts          # Per-platform README artifacts
├── extractors/
│   ├── index.ts           # Barrel export
│   ├── infer-type.ts      # Value → TokenType inference
│   ├── css-properties.ts  # CSS custom property extraction
│   ├── scss-variables.ts  # SCSS variable extraction
│   └── scanner.ts         # Recursive file scanner
├── importers/
│   ├── style-dictionary.ts
│   └── figma-tokens.ts
├── mcp/
│   ├── server.ts          # MCP server — 7 tools over stdio transport
│   └── __tests__/         # MCP tool tests (InMemoryTransport + Client)
└── utils/
    ├── naming.ts          # camelCase, kebab-case, CONSTANT_CASE, etc.
    ├── grouping.ts        # Category grouping + JS object-literal serialization
    ├── format.ts          # Value formatting + theme path helpers
    ├── writer.ts          # Disk I/O for artifacts
    └── errors.ts          # Custom error classes
```

## Key design decisions

### No runtime dependencies in generated output

Generated artifacts never import from toki. They are self-contained files that users can commit, copy, or publish independently.

### Deterministic output

Same input always produces byte-identical artifacts. Artifacts are sorted by `relativePath`. The writer appends a trailing newline for cross-platform determinism.

### Strict TypeScript

The entire codebase uses `strict: true` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. Zero tolerance for `any`.

### Type-safe generator registry

Each platform implements the `Generator` interface and is registered in a typed `Map<OutputFormat, Generator>`. The registry is the single source of truth for supported formats.

### Clean separation of concerns

- Parser validates structure only (no `$type` inheritance)
- Resolver handles references + type inheritance
- Transformers are platform-specific value conversions
- Generators produce idiomatic output for their target
- Writer handles disk I/O with safe `--clean` semantics
