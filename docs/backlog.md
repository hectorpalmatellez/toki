# Toki — Task Checklist

See [`done.md`](./done.md) for completed phases 1–6 and backlog items P5, P7, P9, P10.

## Future Backlog

**Goal:** Post-v1 enhancements, new platform outputs, DX improvements, and enterprise governance features.

| #   | Task                                                                                                                                | Type  | Est. |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- |
| P6  | **Full Generator Plugin API** — extend `TransformPlugin` to a full `GeneratorPlugin` letting users register custom output platforms | API   | 8h   |
| P8  | **Component-Scoped Token Subsets** — given a component manifest, output per-component token files to prevent full-import bloat      | Core  | 8h   |
| P11 | **Flutter/Dart generator** — `Color(0xFF1A73E8)`, `EdgeInsets.all(8)`, `TextStyle`, `ThemeData`/`ThemeExtension` output             | Gen   | 6h   |
| P12 | **WCAG contrast validation** — `toki validate --contrast` computes contrast ratios for color pairs and fails on violations          | Core  | 4h   |
| P13 | **Dead-token / usage analysis** — scan app code for `var(--x)` / `tokens.x` usages, report unused tokens and orphaned CSS vars      | Core  | 5h   |
| P14 | **Remote inputs** — `--input https://…` fetch from URL with cache headers (build and import)                                        | Infra | 3h   |
| P15 | **Color utilities** — derived tokens via `lighten`/`darken`/`alpha`/`mix` transforms for hover/disabled states                      | Core  | 4h   |
| P16 | **`@media (prefers-color-scheme)` CSS output** — emit dark theme as a media-query block instead of a separate file                  | Gen   | 3h   |
| P17 | **`toki doctor`** — diagnose Node version vs engines, config issues, broken refs, cache health                                      | DX    | 2h   |
