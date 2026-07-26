# Toki — Complete Task Checklist

> All four phases are complete — see [`done.md`](./done.md) for the full record.

---

## Phase 4 — Polish & Ecosystem (Weeks 11–14)

**Goal:** Watch mode, diff tooling, import paths from other formats, JSON schema publication, CI integration.

| # | Task | Type | Est. |
|---|---|---|---|
| ~~4.1~~ | ~~Watch mode: `toki watch` uses `chokidar` to monitor input files and config; triggers incremental rebuild on change. Debounce 200ms. Print change summary~~ | CLI | ~~3h~~ ✅ done |
| ~~4.2~~ | ~~Diff command: `toki diff tokens-old.json tokens-new.json` → reports added, removed, and changed tokens with before/after values. Output format: human-readable terminal + optional `--json`~~ | CLI | ~~4h~~ ✅ done |
| ~~4.3~~ | ~~Style Dictionary import: `toki import --from style-dictionary --input sd-config.json` → reads Style Dictionary format, converts to W3C DTCG, writes `tokens.json`~~ | Import | ~~4h~~ ✅ done |
| ~~4.4~~ | ~~Figma Tokens Studio import: `toki import --from figma-tokens --input figma-tokens.json` → reads Tokens Studio export format, converts to W3C DTCG~~ | Import | ~~3h~~ ✅ done |
| ~~4.5~~ | ~~JSON Schema publication: generate and publish `schema/toki-input.json` — IDE autocomplete and VS Code validation. Referenced from README~~ | ~~Infra~~ | ~~2h~~ ✅ done |
| ~~4.6~~ | ~~CI integration documentation: GitHub Actions and Google Cloud Build example workflows~~ | ~~Docs~~ | ~~2h~~ ✅ done |
| ~~4.7~~ | ~~Performance benchmarking: Vitest benchmark suite (281 total tests) — 500/1000/5000 tokens across all 7 generators. Timing assertions with p95 thresholds~~ | ~~Test~~ | ~~2h~~ ✅ done |
| ~~4.8~~ | ~~npm publish preparation: `package.json` `bin`/`files` verified, `.npmignore`, `prepublishOnly` script, `CHANGELOG.md` (Keep a Changelog)~~ | ~~Infra~~ | ~~2h~~ ✅ done |

### Phase 4 Exit Criteria

- [x] `toki watch` rebuilds on file change with <500ms latency
- [x] `toki diff` reports all token changes accurately
- [x] Style Dictionary and Figma Tokens Studio imports produce valid W3C DTCG output
- [x] JSON Schema is valid and referenced in README
- [x] CI example workflows run successfully (GitHub Actions + Google Cloud Build)
- [x] Benchmark shows <2000ms for 5000 tokens across 7 platforms (p95)
- [x] `npm publish` is possible (private registry or public when ready)

---

## Summary

| Phase | Tasks | Estimated Hours |
|---|---|---|
| ~~Phase 1 — Foundation~~ | ~~10 tasks~~ | ~~~26h~~ ✅ done |
| ~~Phase 2 — Multi-Platform~~ | ~~9 tasks~~ | ~~~25h~~ ✅ done |
| ~~Phase 3 — Config & Multi-Theme~~ | ~~9 tasks~~ | ~~~24h~~ ✅ done |
| ~~Phase 4 — All tasks~~ | ~~8 tasks~~ | ~~~22h~~ ✅ done |
| **Remaining** | **0 tasks** | **0h** |

**All phases complete.**
