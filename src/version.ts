/**
 * Resolve the Toki package version at runtime from `package.json`.
 *
 * Reading at runtime (rather than inlining a constant) keeps the version in
 * sync with `package.json` across local dev, vitest, and the published npm
 * bundle. The lookup is relative to *this* module's location, which resolves
 * to the project root in all three execution contexts:
 *   - vitest from `src/version.ts`         → ../../package.json
 *   - tsup bundle in `dist/cli.js`         → ../../package.json (project root)
 *   - published package in `dist/cli.js`   → ../../package.json (package root)
 * A fallback constant guards against the (unlikely) read failure.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const TOKI_VERSION: string = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(here, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();