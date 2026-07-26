# Toki — Complete Task Checklist

> Phases 1 (Foundation), 2 (Multi-Platform), and 3 (Configuration & Multi-Theme) are complete — see [`done.md`](./done.md) for the record of completed tasks and exit-criteria checks. Phase 4 tasks 4.1–4.4 are also complete. This file tracks the remaining tasks.

---

## Phase 4 — Polish & Ecosystem (Weeks 11–14)

**Goal:** Watch mode, diff tooling, import paths from other formats, JSON schema publication, CI integration.

| # | Task | Type | Est. |
|---|---|---|---|
| ~~4.1~~ | ~~Watch mode: `toki watch` uses `chokidar` to monitor input files and config; triggers incremental rebuild on change. Debounce 200ms. Print change summary~~ | CLI | ~~3h~~ ✅ done |
| ~~4.2~~ | ~~Diff command: `toki diff tokens-old.json tokens-new.json` → reports added, removed, and changed tokens with before/after values. Output format: human-readable terminal + optional `--json`~~ | CLI | ~~4h~~ ✅ done |
| ~~4.3~~ | ~~Style Dictionary import: `toki import --from style-dictionary --input sd-config.json` → reads Style Dictionary format, converts to W3C DTCG, writes `tokens.json`~~ | Import | ~~4h~~ ✅ done |
| ~~4.4~~ | ~~Figma Tokens Studio import: `toki import --from figma-tokens --input figma-tokens.json` → reads Tokens Studio export format, converts to W3C DTCG~~ | Import | ~~3h~~ ✅ done |
| 4.5 | JSON Schema publication: generate and publish `schema/toki-input.json` so users get IDE autocomplete and validation in VS Code. Reference schema from README | Infra | 2h |
| 4.6 | CI integration documentation: example workflows for GitHub Actions and Google Cloud Build. Show how to run `toki build` + `toki diff` as a PR check | Docs | 2h |
| 4.7 | Performance benchmarking: write a Vitest benchmark suite that tests 500, 1000, and 5000 token sets across all generators. Report p50/p95/p99 | Test | 2h |
| 4.8 | npm publish preparation: `package.json` `bin` field, `files` field, `.npmignore`, `prepublishOnly` script (test + build), CHANGELOG.md following Keep a Changelog | Infra | 2h |

### Phase 4 Exit Criteria

- [x] `toki watch` rebuilds on file change with <500ms latency
- [x] `toki diff` reports all token changes accurately
- [x] Style Dictionary and Figma Tokens Studio imports produce valid W3C DTCG output
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
| ~~Phase 3 — Config & Multi-Theme~~ | ~~9 tasks~~ | ~~~24h~~ ✅ done |
| ~~Phase 4 (partial) — Watch, Diff, Import~~ | ~~4 tasks~~ | ~~~14h~~ ✅ done |
| Phase 4 (remaining) — Schema, CI, Bench, Publish | 4 tasks | ~8h |
| **Remaining** | **4 tasks** | **~8h** |

**Estimated Timeline:** 1 weekend at 6–8h per weekend (2 weeks part-time for remaining).
