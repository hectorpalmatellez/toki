# Toki Web UI — Plan

## Overview

Add a web-based graphical interface to Toki, triggered via a `toki ui` CLI subcommand. The UI provides a friendlier experience for less technical users (designers, junior developers) who want to browse tokens visually, preview generated output for each platform, and trigger builds without memorizing CLI flags.

**Decision log:**

| Question            | Choice                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Trigger mechanism   | CLI subcommand (`toki ui`)                                                               |
| Feature scope       | Build + preview (token browser, format picker, live preview, build trigger, diff viewer) |
| Package strategy    | Same package (accepted ~60% size increase)                                               |
| Frontend technology | Svelte 5 + Vite                                                                          |

---

## Architecture

```
toki ui --port 3000
         │
         ▼
   ┌─────────────────────────────────────────────┐
   │  Hono HTTP server (Node.js)                 │
   │  ├── Static: Svelte SPA (embedded in dist/) │
   │  └── API routes:                            │
   │      ├── POST /api/build   → runPipeline()  │
   │      ├── POST /api/upload  → save tokens    │
   │      ├── GET  /api/tokens  → resolved tree  │
   │      ├── POST /api/preview → artifact text  │
   │      └── GET  /api/formats → format list    │
   └─────────────────────────────────────────────┘
         │
         ▼
   Browser: Svelte 5 SPA
   ├── Token tree browser (collapsible groups)
   ├── Token value editor (JSON or form)
   ├── Format multiselect + live preview panel
   ├── Build trigger + artifact download
   └── Diff viewer (compare two token sets)
```

---

## Technology choices

| Layer             | Choice               | Rationale                                                                              |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------- |
| HTTP server       | **Hono**             | ~14 kB, ESM-native, zero-config with Node.js built-in `fetch`, TypeScript-first        |
| Frontend          | **Svelte 5 + Vite**  | Minimal JS footprint (~30–50 kB gzipped), great DX, already preferred in stack         |
| Build integration | **tsup multi-entry** | Add `src/web/server.ts` as a second entry; Vite builds the Svelte SPA into `dist/web/` |
| Communication     | **REST + SSE**       | REST for builds/preview; Server-Sent Events for live token updates in watch mode       |

---

## Package weight impact

| Component                   | Estimated size  |
| --------------------------- | --------------- |
| Current package (tarball)   | 152 kB          |
| Hono server code            | ~15 kB          |
| Svelte SPA (built, gzipped) | ~50–80 kB       |
| Svelte SPA (uncompressed)   | ~150–200 kB     |
| **New total (tarball)**     | **~220–250 kB** |
| **New total (unpacked)**    | **~850–950 kB** |

~60% increase in tarball size — acceptable for an npm CLI tool. The main CLI entry still works identically; the web code is only loaded when `toki ui` runs (via dynamic `import()`).

---

## Trigger mechanism

```bash
toki ui                          # opens browser at http://localhost:3000
toki ui --port 8080              # custom port
toki ui --no-open                # don't auto-open browser
toki ui --input tokens.json      # pre-load a token file
toki ui --config toki.config.ts  # use config file defaults
```

The `toki ui` command will:

1. Build the Svelte SPA (at dev time) or serve pre-built assets (in production)
2. Start a Hono server on the specified port
3. Open the browser (unless `--no-open`)
4. Keep the process alive until Ctrl+C

---

## Implementation phases & tasks

### Phase 1: Backend API server (Hono)

| #   | Task                                                                                                  | Files                              |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1.1 | Create `src/web/server.ts` with Hono app, static file serving, and API routes                         | `src/web/server.ts`                |
| 1.2 | Implement `POST /api/build` — accepts token JSON + formats, returns artifacts via `runPipeline()`     | `src/web/server.ts`                |
| 1.3 | Implement `POST /api/preview` — accepts token JSON + single format, returns artifact content as text  | `src/web/server.ts`                |
| 1.4 | Implement `GET /api/tokens` — accepts token file path, returns resolved token tree (flat list + tree) | `src/web/server.ts`                |
| 1.5 | Implement `GET /api/formats` — returns available output formats                                       | `src/web/server.ts`                |
| 1.6 | Implement `POST /api/upload` — accepts file upload, writes to temp path, returns path                 | `src/web/server.ts`                |
| 1.7 | Add `toki ui` subcommand to `src/cli.ts` that starts the server                                       | `src/cli.ts`                       |
| 1.8 | Write API tests using Vitest + Hono test client                                                       | `src/web/__tests__/server.test.ts` |

### Phase 2: Svelte SPA setup

| #   | Task                                                       | Files                           |
| --- | ---------------------------------------------------------- | ------------------------------- |
| 2.1 | Scaffold `src/web/ui/` with Vite + Svelte 5 + TypeScript   | `src/web/ui/`, `vite.config.ts` |
| 2.2 | Configure Vite to output built SPA into `dist/web/`        | `vite.config.ts`                |
| 2.3 | Add `build:web` npm script that runs `vite build`          | `package.json`                  |
| 2.4 | Update `tsup.config.ts` to add `src/web/server.ts` entry   | `tsup.config.ts`                |
| 2.5 | Update `package.json` `files` array to include `dist/web/` | `package.json`                  |

### Phase 3: Svelte UI components

| #   | Task                                                                                 | Files                                           |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 3.1 | Token tree browser — collapsible group/tree view showing all resolved tokens         | `src/web/ui/src/components/TokenTree.svelte`    |
| 3.2 | Token detail panel — shows type, value, description, extensions for a selected token | `src/web/ui/src/components/TokenDetail.svelte`  |
| 3.3 | Token value editor — form or JSON editor for editing token values                    | `src/web/ui/src/components/TokenEditor.svelte`  |
| 3.4 | Format picker — multiselect checkboxes for output formats                            | `src/web/ui/src/components/FormatPicker.svelte` |
| 3.5 | Live preview panel — shows generated artifact content for selected format            | `src/web/ui/src/components/PreviewPanel.svelte` |
| 3.6 | Build trigger button + artifact download links                                       | `src/web/ui/src/components/BuildPanel.svelte`   |
| 3.7 | Diff viewer — side-by-side comparison of two token files                             | `src/web/ui/src/components/DiffView.svelte`     |
| 3.8 | Layout shell — header, sidebar, main content area                                    | `src/web/ui/src/App.svelte`                     |

### Phase 4: Integration & polish

| #   | Task                                                                  | Files                                            |
| --- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 4.1 | Wire SPA to API routes — fetch calls for build, preview, tokens       | `src/web/ui/src/lib/api.ts`                      |
| 4.2 | Add SSE for live token updates (optional, for watch mode integration) | `src/web/server.ts`, `src/web/ui/src/lib/api.ts` |
| 4.3 | Error handling — surface TokiError messages in the UI                 | `src/web/ui/src/lib/api.ts`                      |
| 4.4 | Responsive design — usable on tablet/mobile for quick previews        | `src/web/ui/src/App.svelte`                      |
| 4.5 | Dark/light theme support                                              | `src/web/ui/src/`                                |
| 4.6 | Update README with web UI screenshots and usage instructions          | `README.md`                                      |
| 4.7 | Update AGENTS.md with web UI architecture notes                       | `AGENTS.md`                                      |

### Phase 5: Testing & CI

| #   | Task                                                                     | Files                         |
| --- | ------------------------------------------------------------------------ | ----------------------------- |
| 5.1 | End-to-end tests for API routes (Vitest + Hono test client)              | `src/web/__tests__/`          |
| 5.2 | Component tests for Svelte components (Vitest + @testing-library/svelte) | `src/web/ui/src/**/*.test.ts` |
| 5.3 | Verify `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass | CI                            |
| 5.4 | Verify package size stays under 300 kB tarball                           | `npm pack --dry-run`          |

---

## Key implementation notes

- **Dynamic import**: The `toki ui` command should use `await import('./web/server.js')` so the Hono server code is only loaded when needed. This keeps the main CLI fast.
- **SPA embedding**: The Svelte SPA builds to `dist/web/` and is served as static files by Hono. In production, no separate frontend server is needed.
- **No framework imports in output**: The web UI generates no framework-specific code — it is purely a preview/build tool.
- **File uploads**: Use Hono's built-in file upload handling (`c.req.parseBody()`) for token file uploads.
- **Dev mode**: During development, the Svelte Vite dev server can proxy API calls to the Hono server running on a different port.

---

## Risks & mitigations

| Risk                                         | Impact                   | Mitigation                                      |
| -------------------------------------------- | ------------------------ | ----------------------------------------------- |
| Package size grows ~60%                      | Users download more      | Only loaded on `toki ui`; main CLI unaffected   |
| Svelte 5 is relatively new                   | Ecosystem maturity       | Svelte 5 is stable; minimal dependency surface  |
| Embedded SPA is hard to update independently | Tightly coupled          | Can always split to `@toki/web` later if needed |
| Port conflicts                               | `toki ui` fails to start | Auto-increment port + clear error message       |
