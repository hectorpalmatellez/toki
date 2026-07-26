import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "node24",
  outDir: "dist",
});
