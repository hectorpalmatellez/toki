/**
 * Per-platform README artifacts (task 2.8).
 *
 * Every generator emits a `README.md` alongside its code artifacts so each
 * output subdirectory is self-documenting: quick start, naming convention,
 * multi-theme usage (where applicable), and known limitations.
 */

import type { OutputFormat } from '../core/types.js';
import { headerCommentHtml } from '../utils/format.js';

const MULTI_THEME_NOTE =
  'Toki currently emits a single theme per run. To produce multiple themes, run ' +
  '`toki build` once per theme token file into separate output directories. ' +
  'First-class multi-theme output is planned (see `docs/backlog.md`, Phase 3).';

/** Render the README for one output platform subdirectory. */
export const platformReadme = (format: OutputFormat, version: string): string => {
  const body = BODIES[format];
  return `${headerCommentHtml(version)}\n\n${body.trim()}\n`;
};

const BODIES: Readonly<Record<OutputFormat, string>> = {
  css: `
# Design tokens — CSS

## Quick start

\`\`\`css
@import "./tokens.css";
\`\`\`

\`\`\`css
.button {
  background: var(--color-primary);
  padding: var(--spacing-small);
}
\`\`\`

## Naming convention

Custom properties are \`--kebab-case\` derived from the token path:
\`color.brand.primary\` → \`--color-brand-primary\`.

## Multi-theme usage

${MULTI_THEME_NOTE} The \`:root\` custom properties are theme-ready: override
them under a \`[data-theme]\` or media-query selector in your own stylesheet.

## Known limitations

- Multi-property composite tokens (\`typography\`, \`border\`, \`transition\`)
  are not representable as a single custom property and are skipped.
`,

  js: `
# Design tokens — JavaScript

## Quick start

\`\`\`js
import { colorPrimary, spacingSmall } from "./tokens.js";
\`\`\`

TypeScript consumers get types from the companion \`tokens.d.ts\`.

## Naming convention

Named exports are \`camelCase\` derived from the token path:
\`color.brand.primary\` → \`colorBrandPrimary\`. Reserved words get a trailing
underscore (\`default\` → \`default_\`); leading digits get a \`_\` prefix.

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- Composite values (\`shadow\`, \`typography\`, arrays) are emitted as plain
  object/array literals with sorted keys.
- Two token paths that collapse to the same identifier fail the build with a
  \`GENERATOR_ERROR\` (rename one of the tokens).
`,

  'react-native': `
# Design tokens — React Native

## Quick start

\`\`\`js
import { colors, spacing } from "./tokens.js";
import { backgrounds, textColors, textStyles } from "./styles.js";

const Card = () => <View style={[backgrounds.primary, { padding: spacing.small }]} />;
\`\`\`

## Naming convention

Tokens are grouped by category (first path segment, camelCased and
pluralized): \`color.brand.primary\` → \`colors.brand.primary\`.
\`styles.js\` derives \`StyleSheet.create()\` groups: \`backgrounds\` and
\`textColors\` (from color tokens) and \`textStyles\` (from typography tokens).

## Units

- Dimension tokens are raw numbers: **dp** for layout, **sp** for font sizes
  (\`"8px"\` → \`8\`, \`"1.5rem"\` → \`24\`, base 16).
- \`fontWeight\` is the string form RN expects (\`"bold"\` → \`"700"\`).
- \`fontFamily\` is reduced to the first family name (\`"Inter, sans-serif"\` → \`"Inter"\`).

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- Shadow tokens become \`{ shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }\`.
  \`spread\` has no RN equivalent and is dropped; \`elevation\` is a heuristic
  (\`max(1, round(shadowRadius))\`). Multi-shadow arrays are preserved — RN
  supports one shadow per node, so pick an entry.
- \`border\` and \`transition\` composites are passed through unconverted.
`,

  angular: `
# Design tokens — Angular (latest)

## Quick start

\`\`\`scss
@use "./tokens" as tokens;

.button {
  background: tokens.$color-primary;
}
\`\`\`

\`\`\`ts
import { COLOR_PRIMARY } from "./tokens";
import { DESIGN_TOKENS, DESIGN_TOKENS_PROVIDER } from "./tokens.module";

@Component({ providers: [DESIGN_TOKENS_PROVIDER], ... })
export class ButtonComponent {
  constructor(@Inject(DESIGN_TOKENS) private tokens: DesignTokens) {}
}
\`\`\`

\`tokens.scss\` additionally re-exposes every token as a \`:root\` CSS custom
property via \`@use\`.

## Naming convention

- SCSS variables: \`$kebab-case\` (\`color.brand.primary\` → \`$color-brand-primary\`).
- TypeScript constants: \`CONSTANT_CASE\` (\`color.brand.primary\` → \`COLOR_BRAND_PRIMARY\`).
- The DI value object uses \`camelCase\` keys typed by the \`DesignTokens\` interface.

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- Multi-property composites (\`typography\`, \`border\`, \`transition\`) are
  skipped in SCSS (not representable as one variable); use \`tokens.ts\`.
- Requires an Angular/Sass version with \`@use\` support. For legacy
  \`@import\`-only projects use the \`angular-11\` format instead.
`,

  'angular-11': `
# Design tokens — Angular 11 (legacy)

## Quick start

\`\`\`scss
@import "tokens";

.button {
  background: $color-primary;
}
\`\`\`

\`\`\`ts
import { COLOR_PRIMARY } from "./tokens";
\`\`\`

## Naming convention

- SCSS variables: \`$kebab-case\` (\`color.brand.primary\` → \`$color-brand-primary\`).
- TypeScript constants: \`CONSTANT_CASE\` (\`color.brand.primary\` → \`COLOR_BRAND_PRIMARY\`).

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- SCSS output intentionally uses \`@import\` only (no \`@use\`/\`@forward\`) for
  Angular 11 compatibility. \`@import\` is deprecated upstream — migrate to the
  \`angular\` format when upgrading.
- No \`InjectionToken\` module is generated (Angular 11 DI patterns differ);
  import the constants directly.
- Multi-property composites (\`typography\`, \`border\`, \`transition\`) are
  skipped in SCSS; use \`tokens.ts\`.
`,

  svelte: `
# Design tokens — Svelte

## Quick start

Import the CSS once (e.g. in \`+layout.svelte\` or your app entry):

\`\`\`svelte
<script>
  import "./tokens.css";
  import { colorPrimary } from "./tokens.ts";
</script>

<style>
  button {
    background: var(--color-primary);
  }
</style>
\`\`\`

## Naming convention

- CSS custom properties: \`--kebab-case\` (\`color.brand.primary\` → \`--color-brand-primary\`).
- ES module exports: \`camelCase\` (\`color.brand.primary\` → \`colorBrandPrimary\`).

## Scoped styles

\`tokens.css\` declares variables on \`:root\`, so they cascade through Svelte's
scoped \`<style>\` blocks — \`var(--color-primary)\` works in any component
without extra setup.

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- Multi-property composite tokens (\`typography\`, \`border\`, \`transition\`)
  are skipped in \`tokens.css\`; import them from \`tokens.ts\` instead.
`,

  stencil: `
# Design tokens — StencilJS

## Quick start

Import the CSS once (e.g. in your app root or \`globalStyle\`):

\`\`\`css
@import "./tokens.css";
\`\`\`

\`\`\`tsx
import { tokens, colorPrimary } from "./tokens";
import type { ColorToken, TokenName } from "./types";

// Use token values directly:
const primary = colorPrimary;

// Use CSS variables natively in your styles:
// background: var(--color-primary);

// Type-safe @Prop() for token names:
@Component({ tag: "my-component" })
export class MyComponent {
  @Prop() color: ColorToken = "color.primary";
}
\`\`\`

## Naming convention

- CSS custom properties: \`--kebab-case\` (\`color.brand.primary\` → \`--color-brand-primary\`).
- ES module exports: \`camelCase\` (\`color.brand.primary\` → \`colorBrandPrimary\`).
- The grouped \`tokens\` object uses PascalCase categories (\`{ Colors: { primary: "..." }, Spacing: { small: "..." } }\`).
- \`types.ts\` union members use the dotted token path (\`color.brand.primary\`).

## Scoped styles

\`tokens.css\` declares variables on \`:root\`, so they cascade through Stencil's
scoped Shadow DOM — \`var(--color-primary)\` works in any component without
extra setup.

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- Multi-property composite tokens (\`typography\`, \`border\`, \`transition\`)
  are skipped in \`tokens.css\`; import them from \`tokens.ts\` instead.
`,

  react: `
# Design tokens — React / Next.js

## Quick start

\`\`\`tsx
import { theme } from "./theme";

const Button = () => (
  <button style={{ background: theme.colors.primary, padding: theme.spacing.small }} />
);
\`\`\`

CSS-in-JS: pass \`theme\` (or a subtree) to your provider. Tailwind:
\`theme: { extend: theme }\` in \`tailwind.config.ts\`. \`theme\` is exported
\`as const\`, so \`Theme\` (\`typeof theme\`) has literal types.

## Companion CSS (next-themes)

Import \`tokens.css\` once in your app to expose every token as a \`:root\`
custom property; combine with \`next-themes\`' attribute switching
(\`data-theme="dark"\`) by overriding the variables per theme.

## Naming convention

The theme object is nested by category (first path segment, camelCased and
pluralized): \`color.brand.primary\` → \`theme.colors.brand.primary\`.

## Multi-theme usage

${MULTI_THEME_NOTE} The nested object shape is theme-ready: merge or swap
theme objects per color scheme.

## Known limitations

- Composite values (\`shadow\`, \`typography\`) are nested plain objects.
- \`tokens.css\` skips multi-property composites (mirrors the CSS format).
`,

  vue: `
# Design tokens — Vue

## Quick start

Import the CSS once (e.g. in \`App.vue\` or your main entry):

\`\`\`vue
<script setup>
import "./tokens.css";
import { colorPrimary } from "./tokens.ts";
</script>

<style scoped>
button {
  background: var(--color-primary);
}
</style>
\`\`\`

## Naming convention

- CSS custom properties: \`--kebab-case\` (\`color.brand.primary\` → \`--color-brand-primary\`).
- ES module exports: \`camelCase\` (\`color.brand.primary\` → \`colorBrandPrimary\`).

## Scoped styles

\`tokens.css\` declares variables on \`:root\`, so they cascade through Vue's
scoped \`<style>\` blocks — \`var(--color-primary)\` works in any component
without extra setup.

## Multi-theme usage

${MULTI_THEME_NOTE}

## Known limitations

- Multi-property composite tokens (\`typography\`, \`border\`, \`transition\`)
  are skipped in \`tokens.css\`; import them from \`tokens.ts\` instead.
`,

  tailwind: `
# Design tokens — Tailwind CSS v4

## Quick start

Import the generated tokens CSS in your main stylesheet:

\`\`\`css
@import "tailwindcss";
@import "./tokens.css";
\`\`\`

Tokens are now available as Tailwind utilities:

\`\`\`html
<div class="bg-primary text-secondary p-md font-bold">
  Themed with design tokens
</div>
\`\`\`

## Naming convention

Token types map to Tailwind's \`@theme\` namespace:

| Toki type | Tailwind namespace |
|---|---|
| \`color\` | \`--color-*\` |
| \`dimension\` | \`--spacing-*\` |
| \`fontWeight\` | \`--font-weight-*\` |
| \`fontFamily\` | \`--font-family-*\` |
| \`lineHeight\` | \`--line-height-*\` |
| \`letterSpacing\` | \`--letter-spacing-*\` |
| \`duration\` | \`--duration-*\` |
| \`cubicBezier\` | \`--ease-*\` |
| \`number\` | \`--*\` (path-derived) |

Path prefixes override type-based inference: a token at \`radius.lg\` maps to \`--radius-lg\` regardless of its \`$type\`.

## Multi-theme usage

${MULTI_THEME_NOTE} The \`@theme\` block is theme-ready: emit separate \`tokens.light.css\` and \`tokens.dark.css\` files, each with its own \`@theme\` block.

## Known limitations

- Composite tokens (\`typography\`, \`border\`, \`transition\`) are skipped — not representable in \`@theme\`.
- \`shadow\` tokens are skipped — Tailwind v4 shadows use a different syntax.
`,
};
