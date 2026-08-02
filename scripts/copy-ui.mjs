// Copy the static UI assets (index.html, styles.css) next to the bundled
// `dist/ui/app.js` after tsup builds. `dist/` is already shipped in the npm
// package via the `files` field, so the editor travels with the CLI.

import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/ui', { recursive: true });
cpSync('src/ui/public', 'dist/ui', { recursive: true });
