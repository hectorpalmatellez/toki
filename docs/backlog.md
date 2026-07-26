# Toki — Complete Task Checklist

> Phases 1 (Foundation) and 2 (Multi-Platform) are complete — see [`done.md`](./done.md) for the record of completed tasks and exit-criteria checks. This file tracks the remaining phases.

---

## Phase 3 — Configuration & Multi-Theme (Weeks 8–10)

**Goal:** Production-grade ergonomics. Config file support, multi-theme output, naming transforms, and plugin hooks.

| # | Task | Type | Est. |
|---|---|---|---|
| 3.1 | Build config file loader: `tokenwright.config.ts` (or `.js`) loaded via `jiti`. Config discovery: current directory → `--config` flag → default | Infra | 3h |
| 3.2 | Define config schema: `input` (glob patterns), `output` (per-format directory), `themes` (mapping of theme name → token file), `naming` (per-format naming convention), `transforms` (custom transform functions) | Types | 2h |
| 3.3 | Multi-theme support: config specifies `{ light: "tokens/light.json", dark: "tokens/dark.json" }` → generators produce separate output files per theme (e.g., `tokens.light.css`, `tokens.dark.css`) | Core | 4h |
| 3.4 | Naming transform system: `camelCase` (JS default), `kebab-case` (CSS default), `CONSTANT_CASE` (Angular/TS), `SCREAMING_SNAKE_CASE` (SCSS). Configurable per platform in config file | Core | 2h |
| 3.5 | Custom transform plugin API: users can register transform functions in config that modify token values before generation. Example: `transforms: [addAlphaChannel, convertToRem]` | Core | 4h |
| 3.6 | `toki init` command: interactive scaffolding wizard that generates a starter `tokens.json` (with sample color, spacing, typography tokens) + `tokenwright.config.ts` | CLI | 2h |
| 3.7 | Verbose/debug mode: `--verbose` flag prints resolution trace (which tokens were resolved, in what order, cycle detection details), generator output paths, and timing | CLI | 1h |
| 3.8 | Write Vitest tests: config loading (TS and JS), multi-theme output, naming transforms for all 4 conventions, plugin execution order | Test | 4h |
| 3.9 | Update README: config file reference, multi-theme examples, plugin API documentation | Docs | 2h |

### Phase 3 Exit Criteria

- [ ] `toki build` with no flags discovers and loads `tokenwright.config.ts`
- [ ] Multi-theme config produces separate output files per theme
- [ ] Naming transforms produce correct output for each convention
- [ ] Custom transform functions execute in registration order
- [ ] `toki init` scaffolds a working starter project
- [ ] All tests pass
- [ ] README documents config file schema completely

---

## Phase 4 — Polish & Ecosystem (Weeks 11–14)

**Goal:** Watch mode, diff tooling, import paths from other formats, JSON schema publication, CI integration.

| # | Task | Type | Est. |
|---|---|---|---|
| 4.1 | Watch mode: `toki watch` uses `chokidar` to monitor input files and config; triggers incremental rebuild on change. Debounce 200ms. Print change summary | CLI | 3h |
| 4.2 | Diff command: `toki diff tokens-old.json tokens-new.json` → reports added, removed, and changed tokens with before/after values. Output format: human-readable terminal + optional `--json` | CLI | 4h |
| 4.3 | Style Dictionary import: `toki import --from style-dictionary --input sd-config.json` → reads Style Dictionary format, converts to W3C DTCG, writes `tokens.json` | Import | 4h |
| 4.4 | Figma Tokens Studio import: `toki import --from figma-tokens --input figma-tokens.json` → reads Tokens Studio export format, converts to W3C DTCG | Import | 3h |
| 4.5 | JSON Schema publication: generate and publish `schema/tokenwright-input.json` so users get IDE autocomplete and validation in VS Code. Reference schema from README | Infra | 2h |
| 4.6 | CI integration documentation: example workflows for GitHub Actions and Google Cloud Build. Show how to run `toki build` + `toki diff` as a PR check | Docs | 2h |
| 4.7 | Performance benchmarking: write a Vitest benchmark suite that tests 500, 1000, and 5000 token sets across all generators. Report p50/p95/p99 | Test | 2h |
| 4.8 | npm publish preparation: `package.json` `bin` field, `files` field, `.npmignore`, `prepublishOnly` script (test + build), CHANGELOG.md following Keep a Changelog | Infra | 2h |

### Phase 4 Exit Criteria

- [ ] `toki watch` rebuilds on file change with <500ms latency
- [ ] `toki diff` reports all token changes accurately
- [ ] Style Dictionary and Figma Tokens Studio imports produce valid W3C DTCG output
- [ ] JSON Schema is valid and referenced in README
- [ ] CI example workflows run successfully
- [ ] Benchmark shows <200ms for 500 tokens across 6 platforms
- [ ] `npm publish` is possible (private registry or public when ready)

---

## Summary

| Phase | Tasks | Estimated Hours |
|---|---|---|
| ~~Phase 1 — Foundation~~ | ~~10 tasks~~ | ~~~26h~~ ✅ done |
| ~~Phase 2 — Multi-Platform~~ | ~~9 tasks~~ | ~~~25h~~ ✅ done |
| Phase 3 — Config & Multi-Theme | 9 tasks | ~24h |
| Phase 4 — Polish & Ecosystem | 8 tasks | ~22h |
| **Remaining** | **17 tasks** | **~46h** |

**Estimated Timeline:** 12–16 weekends at 6–8h per weekend (3–4 months part-time).