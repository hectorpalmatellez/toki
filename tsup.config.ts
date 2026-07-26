import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "node24",
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
