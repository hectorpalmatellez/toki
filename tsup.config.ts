import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
    'ui/app': 'src/ui/app.ts',
  },
  format: ['esm'],
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'node24',
  outDir: 'dist',
  onSuccess: 'node scripts/copy-ui.mjs',
});
