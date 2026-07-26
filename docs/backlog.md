# Toki — Task Checklist

## Completed phases

All phases 1–4 are complete. See [`done.md`](./done.md) for the full record.

| Phase                          | Tasks    | Status  |
| ------------------------------ | -------- | ------- |
| Phase 1 — Foundation           | 10 tasks | ✅ done |
| Phase 2 — Multi-Platform       | 9 tasks  | ✅ done |
| Phase 3 — Config & Multi-Theme | 9 tasks  | ✅ done |
| Phase 4 — Polish & Ecosystem   | 8 tasks  | ✅ done |

## Phase 5 — Public Release

**Goal:** npm publication, community docs, and security hardening.

| #   | Task                                                            | Type    | Est. |
| --- | --------------------------------------------------------------- | ------- | ---- |
| 5.1 | Add `repository`, `homepage`, `bugs` fields to `package.json`   | Infra   | 0.5h |
| 5.2 | Add `"sideEffects": false` to `package.json`                    | Infra   | 0.1h |
| 5.3 | Create `CONTRIBUTING.md` with setup, testing, and PR guidelines | Docs    | 1h   |
| 5.4 | Create `CODE_OF_CONDUCT.md` (Contributor Covenant)              | Docs    | 0.5h |
| 5.5 | Add `npm pack` verification to CI (check published files)       | Infra   | 1h   |
| 5.6 | Add security policy (`SECURITY.md`) + `npm audit` to CI         | Infra   | 1h   |
| 5.7 | Publish v0.1.0 to npm (requires `npm login` once)               | Release | 0.5h |
