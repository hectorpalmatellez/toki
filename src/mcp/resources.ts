import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { implementedFormats } from '../generators/index.js';
import { TOKEN_TYPE_PATTERNS } from '../extractors/index.js';
import { readTokenFile, parseTokenDocument } from '../core/parser.js';
import { resolveDocument } from '../core/resolver.js';
import { TokiError } from '../utils/errors.js';
import type { OutputFormat, NamingConvention } from '../core/types.js';

const FORMAT_DESCRIPTIONS: Readonly<Record<OutputFormat, string>> = {
  css: 'CSS custom properties (:root block)',
  js: 'JavaScript ES module with named exports + .d.ts declarations',
  'react-native': 'React Native grouped objects + StyleSheet helpers',
  angular: 'Angular (latest) SCSS (@use) + TypeScript constants + DI module',
  'angular-11': 'Angular 11 SCSS (@import only) + TypeScript constants',
  svelte: 'Svelte CSS custom properties + ES module',
  react: 'React/Next.js nested theme object + companion CSS',
  stencil: 'StencilJS CSS custom properties + ES module + union types',
  vue: 'Vue CSS custom properties + ES module',
  tailwind: 'Tailwind CSS v4 @theme block with namespace-mapped custom properties',
};

const FORMAT_ARTIFACTS: Readonly<Record<OutputFormat, readonly string[]>> = {
  css: ['css/tokens.css', 'css/README.md'],
  js: ['js/tokens.js', 'js/tokens.d.ts', 'js/README.md'],
  'react-native': ['react-native/tokens.js', 'react-native/styles.js', 'react-native/README.md'],
  angular: ['angular/_tokens.scss', 'angular/tokens.scss', 'angular/tokens.ts', 'angular/tokens.module.ts', 'angular/README.md'],
  'angular-11': ['angular-11/_tokens.scss', 'angular-11/tokens.ts', 'angular-11/README.md'],
  svelte: ['svelte/tokens.css', 'svelte/tokens.ts', 'svelte/README.md'],
  react: ['react/theme.ts', 'react/tokens.css', 'react/README.md'],
  stencil: ['stencil/tokens.css', 'stencil/tokens.ts', 'stencil/tokens.d.ts', 'stencil/types.ts', 'stencil/README.md'],
  vue: ['vue/tokens.css', 'vue/tokens.ts', 'vue/README.md'],
  tailwind: ['tailwind/tokens.css', 'tailwind/README.md'],
};

const DEFAULT_NAMING_MAP: Readonly<Record<OutputFormat, NamingConvention>> = {
  css: 'kebab-case',
  js: 'camelCase',
  'react-native': 'camelCase',
  angular: 'CONSTANT_CASE',
  'angular-11': 'CONSTANT_CASE',
  svelte: 'kebab-case',
  react: 'camelCase',
  stencil: 'camelCase',
  vue: 'kebab-case',
  tailwind: 'kebab-case',
};

const W3C_DTCG_SPEC = `# W3C DTCG Format Reference

## Token structure

Each token is a JSON object with these properties:

| Property | Type | Required | Description |
|---|---|---|---|
| \`$value\` | any | yes | The token's value (string, number, object, or array) |
| \`$type\` | string | no | The token type; inherited from parent groups |
| \`$description\` | string | no | Human-readable description |
| \`$extensions\` | object | no | Platform-specific metadata |

## Group structure

Groups are intermediate JSON objects that contain tokens or sub-groups.
A group can set \`$type\` which propagates to all descendant tokens
unless overridden.

\`\`\`json
{
  "color": {
    "$type": "color",
    "primary": { "$value": "#1a73e8" },
    "secondary": { "$value": "{color.primary}" }
  }
}
\`\`\`

## Reference syntax

Tokens can reference other tokens using \`{group.token}\` syntax.
References are resolved recursively and may appear in string values.

\`\`\`json
{
  "color": {
    "primary": { "$value": "#1a73e8" },
    "alias": { "$value": "{color.primary}" }
  }
}
\`\`\`

## Supported \`$type\` values

| Type | Value pattern |
|---|---|
| \`color\` | \`#hex\`, \`rgb()\`, \`hsl()\`, named colors |
| \`dimension\` | \`16px\`, \`1rem\`, \`0.5em\` |
| \`fontFamily\` | \`"Inter", sans-serif\` |
| \`fontWeight\` | \`400\`, \`700\`, \`bold\` |
| \`duration\` | \`300ms\`, \`0.3s\` |
| \`cubicBezier\` | \`[0.4, 0, 0.2, 1]\` (4-element array) |
| \`number\` | \`1.5\`, \`42\` |
| \`lineHeight\` | \`1.5\`, \`24px\` |
| \`letterSpacing\` | \`0.5px\`, \`0.02em\` |
| \`shadow\` | Object or array of objects: \`{ x, y, blur, spread, color }\` |
| \`typography\` | Object: \`{ fontFamily, fontSize, fontWeight, lineHeight }\` |
| \`border\` | Object: \`{ width, style, color }\` |
| \`transition\` | Object: \`{ property, duration, timing, delay }\` |

## Complete example

\`\`\`json
{
  "color": {
    "$type": "color",
    "primary": {
      "$value": "#1a73e8",
      "$description": "Primary brand color"
    },
    "secondary": {
      "$value": "{color.primary}",
      "$description": "Alias to primary"
    }
  },
  "spacing": {
    "$type": "dimension",
    "small": { "$value": "8px" },
    "medium": { "$value": "16px" }
  },
  "font": {
    "$type": "fontFamily",
    "sans": { "$value": "Inter, sans-serif" }
  }
}
\`\`\`
`;

export const registerResources = (server: McpServer): void => {
  server.resource(
    'supported-formats',
    'toki://formats',
    {
      title: 'Supported Output Formats',
      description: 'List of all output formats supported by Toki, with descriptions and default naming conventions',
      mimeType: 'application/json',
    },
    async (uri) => {
      const formats = implementedFormats().map((id) => ({
        id,
        description: FORMAT_DESCRIPTIONS[id],
        namingDefault: DEFAULT_NAMING_MAP[id],
        artifacts: FORMAT_ARTIFACTS[id],
      }));
      return {
        contents: [{ uri: uri.href, text: JSON.stringify({ formats }, null, 2) }],
      };
    },
  );

  server.resource(
    'token-types',
    'toki://token-types',
    {
      title: 'Token Type Reference',
      description: 'W3C DTCG token types supported by Toki, with value patterns and examples',
      mimeType: 'application/json',
    },
    async (uri) => {
      const types = Object.entries(TOKEN_TYPE_PATTERNS).map(([type, info]) => ({
        type,
        patterns: info.patterns,
        examples: info.examples,
      }));
      return {
        contents: [{ uri: uri.href, text: JSON.stringify({ types }, null, 2) }],
      };
    },
  );

  server.resource(
    'w3c-dtcg-spec',
    'toki://w3c-dtcg-spec',
    {
      title: 'W3C DTCG Format Reference',
      description: 'Quick reference for the W3C Design Tokens Community Group format that Toki consumes',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      return {
        contents: [{ uri: uri.href, text: W3C_DTCG_SPEC }],
      };
    },
  );

  server.resource(
    'resolved-tokens',
    new ResourceTemplate('toki://tokens/{+input}', { list: undefined }),
    {
      title: 'Resolved Design Tokens',
      description:
        'Fully resolved token list (references expanded, $type inherited) for a W3C DTCG token file. Returns JSON with tokenCount and a flat array of resolved tokens.',
      mimeType: 'application/json',
    },
    async (uri, params) => {
      try {
        const input = params['input'] as string;
        const raw = await readTokenFile(input);
        const doc = parseTokenDocument(raw, input);
        const tokens = resolveDocument(doc);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ tokenCount: tokens.length, tokens }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof TokiError) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({ error: `[${error.code}] ${error.message}` }, null, 2),
              },
            ],
          };
        }
        if (error instanceof Error) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({ error: error.message }, null, 2),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: String(error) }, null, 2),
            },
          ],
        };
      }
    },
  );
};
