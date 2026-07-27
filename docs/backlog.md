# Toki — Task Checklist

See [`done.md`](./done.md) for completed phases 1–5.

## Future Backlog

**Goal:** Post-v1 enhancements, new platform outputs, DX improvements, and enterprise governance features.

| #    | Task                                                                                                                                      | Type     | Est. |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- |
| P1   | **Composite Type Generator Support** — typography, border, transition composites currently skipped in CSS/SCSS; generate CSS longhands     | Gen      | 6h   |
| P2   | **StencilJS Generator** — new 8th platform: CSS custom properties + TS constants + Stencil token module                                  | Gen      | 6h   |
| P3   | **Tailwind CSS v4 Plugin Output** — `tailwind.config.ts` with `theme.extend` + CSS custom properties, compatible with tailwindcss v4      | Gen      | 4h   |
| P4   | **PR-First Diff Integration** — emit GitHub-compatible markdown diff summary from `toki diff` for posting as PR comment                    | CLI      | 3h   |
| P5   | **`toki validate` (Standalone Linter)** — structural validity, broken refs, circular deps, naming violations without generating output     | CLI      | 4h   |
| P6   | **Parallel Generator Execution** — run selected generators concurrently via `Promise.all` after Transform stage                          | Perf     | 1h   |
| P7   | **Full Generator Plugin API** — extend `TransformPlugin` to a full `GeneratorPlugin` letting users register custom output platforms      | API      | 8h   |
| P8   | **Incremental Builds (Cache Layer)** — SHA-256 cache of resolved token trees, skip re-generation on unchanged input                        | Perf     | 6h   |
| P9   | **Component-Scoped Token Subsets** — given a component manifest, output per-component token files to prevent full-import bloat            | Core     | 8h   |
| P10  | **Output Schema Publication** — publish JSON Schema per platform output format for IDE autocomplete on generated files                     | Docs     | 3h   |
| P11  | **IntelliSense Snippet Generation** — editor-agnostic completion spec (LSP / VS Code) from resolved tokens for design system DX           | DX       | 4h   |
