# Toki — MCP (Model Context Protocol)

Toki includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI tools (Claude Desktop, Cursor, Windsurf, etc.) interact directly with the token pipeline.

## Quick start

### Start the MCP server

```bash
toki mcp
```

The server runs over stdio transport — no ports, no network, no hosting. AI editors spawn it as a subprocess.

### Configure your AI editor

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "toki": {
      "command": "npx",
      "args": ["-y", "@hectorpalmatellez/toki", "mcp"]
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "toki": {
      "command": "toki",
      "args": ["mcp"]
    }
  }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "toki": {
      "command": "npx",
      "args": ["-y", "@hectorpalmatellez/toki", "mcp"]
    }
  }
}
```

## Available tools

Toki exposes 7 tools, 3 resources, 1 dynamic resource, and 3 prompts to AI agents:

| Tool                                | Description                                                |
| ----------------------------------- | ---------------------------------------------------------- |
| [`parse_tokens`](#parse_tokens)     | Parse and validate a W3C DTCG token file                   |
| [`resolve_tokens`](#resolve_tokens) | Expand references, show resolved values                    |
| [`preview_format`](#preview_format) | Generate output for one platform without writing to disk   |
| [`build_tokens`](#build_tokens)     | Full pipeline — parse, resolve, transform, generate, write |
| [`diff_tokens`](#diff_tokens)       | Compare two token files                                    |
| [`list_formats`](#list_formats)     | List all supported output formats                          |
| [`extract_tokens`](#extract_tokens) | Scan CSS/SCSS files to extract token candidates            |

Resources and prompts are auto-discovered by MCP clients — no configuration changes needed.

---

### `parse_tokens`

Parse and validate a W3C DTCG token file. Returns the token tree or validation errors.

**Parameters:**

| Name    | Type     | Required | Description                            |
| ------- | -------- | -------- | -------------------------------------- |
| `input` | `string` | yes      | Path to the token file (W3C DTCG JSON) |

**Example — AI validates a token file:**

```
AI: "Let me check your tokens.json for errors."
→ calls parse_tokens({ input: "./tokens.json" })
← { valid: true, tokenCount: 42, tree: { ... } }
AI: "Your token file is valid with 42 tokens."
```

---

### `resolve_tokens`

Expand `{group.token}` references, apply `$type` inheritance, and return the fully resolved token list.

**Parameters:**

| Name    | Type     | Required | Description            |
| ------- | -------- | -------- | ---------------------- |
| `input` | `string` | yes      | Path to the token file |

**Example — AI debugs a reference chain:**

```
AI: "Let me resolve your tokens to check the reference expansion."
→ calls resolve_tokens({ input: "./tokens.json" })
← { tokenCount: 42, tokens: [{ id: "color.primary", value: "#1a73e8", type: "color", ... }, ...] }
AI: "color.secondary correctly resolves to #1a73e8 via {color.primary}."
```

---

### `preview_format`

Generate output for a specific platform format and return the artifact content — without writing to disk.

**Parameters:**

| Name     | Type               | Required | Description                                                                                                          |
| -------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `input`  | `string`           | yes      | Path to the token file                                                                                               |
| `format` | `OutputFormat`     | yes      | Target format: `css`, `js`, `react-native`, `angular`, `angular-11`, `svelte`, `react`, `stencil`, `vue`, `tailwind` |
| `naming` | `NamingConvention` | no       | Override naming convention                                                                                           |

**Example — AI previews CSS output:**

```
AI: "Here's what your tokens will look like as CSS custom properties:"
→ calls preview_format({ input: "./tokens.json", format: "css" })
← { artifacts: [{ relativePath: "css/tokens.css", content: ":root {\n  --color-primary: #1a73e8;\n..." }] }
```

---

### `build_tokens`

Run the full pipeline: parse, resolve, transform, generate, and write artifacts to disk.

**Parameters:**

| Name      | Type             | Required | Default | Description                    |
| --------- | ---------------- | -------- | ------- | ------------------------------ |
| `input`   | `string`         | yes      | —       | Path to the token file         |
| `output`  | `string`         | yes      | —       | Output directory               |
| `formats` | `OutputFormat[]` | yes      | —       | Formats to generate            |
| `clean`   | `boolean`        | no       | `true`  | Clean output directories first |
| `verbose` | `boolean`        | no       | `false` | Enable verbose logging         |

**Example — AI triggers a build:**

```
User: "Build my tokens for CSS and React Native."
AI:
→ calls build_tokens({ input: "./tokens.json", output: "./dist", formats: ["css", "react-native"] })
← { written: ["dist/css/tokens.css", "dist/react-native/tokens.ts", ...], tokenCount: 42, elapsed: 15 }
AI: "Done! Built 5 artifacts from 42 tokens in 15ms."
```

---

### `diff_tokens`

Compare two token files and report added, removed, and changed tokens.

**Parameters:**

| Name     | Type                   | Required | Description                                                                        |
| -------- | ---------------------- | -------- | ---------------------------------------------------------------------------------- |
| `old`    | `string`               | yes      | Path to the old token file                                                         |
| `new`    | `string`               | yes      | Path to the new token file                                                         |
| `output` | `"json" \| "markdown"` | no       | Output format: `json` for structured data, `markdown` for GitHub-compatible tables |

**Example — AI explains token changes:**

```
User: "What changed in my tokens?"
AI:
→ calls diff_tokens({ old: "./tokens-old.json", new: "./tokens.json" })
← { added: [{ id: "color.accent" }], removed: [], changed: [{ id: "spacing.md", oldValue: "16px", newValue: "12px" }] }
AI: "You added color.accent and changed spacing.md from 16px to 12px."
```

**Example — AI produces a Markdown diff for a PR comment:**

```
User: "Generate a diff I can paste into a PR."
AI:
→ calls diff_tokens({ old: "./tokens-old.json", new: "./tokens.json", output: "markdown" })
← { markdown: "## Token diff\n\n### Added\n| Token | Type | Value |\n|..." }
AI: "Here's the Markdown diff for your PR:\n\n..."
```

---

### `list_formats`

List all output formats supported by Toki.

**Parameters:** None

**Example:**

```
→ calls list_formats({})
← { formats: ["css", "js", "react-native", "angular", "angular-11", "svelte", "react", "stencil", "vue", "tailwind"] }
```

---

### `extract_tokens`

Scan CSS and SCSS files in a project directory, extract design token candidates (custom properties and SCSS variables), infer their types from value patterns, and return the raw data for the AI agent to organize.

This is the **reverse pipeline** — going from existing code to tokens.

**Parameters:**

| Name         | Type       | Required | Default             | Description               |
| ------------ | ---------- | -------- | ------------------- | ------------------------- |
| `path`       | `string`   | yes      | —                   | File or directory to scan |
| `extensions` | `string[]` | no       | `[".css", ".scss"]` | File extensions to scan   |
| `output`     | `string`   | no       | `"raw"`             | Output mode (see below)   |

#### Output modes

**`raw`** (default) — Returns extracted tokens with inferred types plus a Toki type system reference. The AI agent uses this to intelligently organize tokens into a proper W3C DTCG structure.

```json
{
  "extracted": [
    { "id": "color-primary", "value": "#1a73e8", "inferredType": "color", "source": "styles/vars.css", "line": 12 },
    { "id": "spacing-md", "value": "16px", "inferredType": "dimension", "source": "styles/vars.css", "line": 13 }
  ],
  "summary": {
    "totalExtracted": 42,
    "byType": { "color": 15, "dimension": 20 },
    "untyped": 7,
    "sources": ["styles/vars.css"]
  },
  "tokiReference": {
    "tokenTypes": [{ "type": "color", "patterns": ["#hex", "rgb()", "hsl()"], "examples": ["#1a73e8"] }],
    "outputFormats": [
      "css",
      "js",
      "react-native",
      "angular",
      "angular-11",
      "svelte",
      "react",
      "stencil",
      "vue",
      "tailwind"
    ],
    "hint": "Use the extracted tokens and type reference to organize tokens into a W3C DTCG structure."
  }
}
```

**`json`** — Returns a flat token map with inferred `$type` and `$value`. The AI agent can then restructure it into a proper nested DTCG document.

```json
{
  "tokens": {
    "color-primary": { "$type": "color", "$value": "#1a73e8" },
    "spacing-md": { "$type": "dimension", "$value": "16px" }
  },
  "tokenCount": 42,
  "sources": ["styles/vars.css"]
}
```

**Any format name** (`css`, `js`, `react-native`, etc.) — Pipes extracted tokens through the Toki pipeline to generate artifacts in that format.

```json
{
  "format": "css",
  "artifacts": [{ "relativePath": "css/tokens.css", "content": ":root {\n  --color-primary: #1a73e8;\n..." }],
  "tokenCount": 42,
  "skippedUntyped": 7,
  "sources": ["styles/vars.css"]
}
```

#### Type inference

The extractor recognizes these value patterns:

| Inferred type | Patterns                                                       |
| ------------- | -------------------------------------------------------------- |
| `color`       | `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, named CSS colors |
| `dimension`   | `Npx`, `Nrem`, `Nem`                                           |
| `duration`    | `Nms`, `Ns`                                                    |
| `fontWeight`  | `100`–`900`, `normal`, `bold`, `lighter`, `bolder`             |
| `fontFamily`  | Comma-separated font lists, quoted font names                  |
| `number`      | Unitless integers or decimals                                  |

Values that don't match any pattern get `inferredType: undefined` — the AI agent decides what to do with them.

#### Example — AI extracts tokens from an existing project

```
User: "Extract design tokens from my project's CSS files."
AI:
→ calls extract_tokens({ path: "./src/styles", output: "raw" })
← { extracted: [...], summary: { totalExtracted: 58, byType: { color: 22, dimension: 28 }, untyped: 8 }, tokiReference: { ... } }
AI: "I found 58 token candidates: 22 colors, 28 dimensions, 8 untyped.
     Here's how I'd organize them into a W3C DTCG structure:
     [writes organized tokens.json]"

User: "Now generate CSS and JS output from those."
AI:
→ calls build_tokens({ input: "./tokens.json", output: "./dist", formats: ["css", "js"] })
← { written: [...], tokenCount: 58 }
```

---

## Workflow examples

### Validate and preview before building

```
User: "Check my tokens and show me what the React Native output will look like."
AI:
1. parse_tokens({ input: "./tokens.json" })    → valid
2. preview_format({ input: "./tokens.json", format: "react-native" })
3. Presents the React Native theme object to the user
4. build_tokens({ input: "./tokens.json", output: "./dist", formats: ["react-native"] })
```

### Migrate from CSS custom properties to Toki

```
User: "I have CSS custom properties in my project. Help me migrate to Toki."
AI:
1. extract_tokens({ path: "./src", output: "raw" })
2. Organizes extracted tokens into a proper W3C DTCG structure
3. Writes tokens.json
4. build_tokens({ input: "./tokens.json", output: "./dist", formats: ["css", "js", "react-native"] })
5. User now has framework-specific tokens generated from their original CSS
```

### Review token changes across versions

```
User: "Compare my old and new token files and explain the breaking changes."
AI:
1. diff_tokens({ old: "./tokens-v1.json", new: "./tokens-v2.json" })
2. Analyzes added/removed/changed tokens
3. Reports which downstream consumers might break
4. Suggests a migration strategy
```

## Available resources

Resources are read-only data endpoints that AI agents can query for context.

| Resource URI           | Title                     | Mime type          |
| ---------------------- | ------------------------- | ------------------ |
| `toki://formats`       | Supported Output Formats  | `application/json` |
| `toki://token-types`   | Token Type Reference      | `application/json` |
| `toki://w3c-dtcg-spec` | W3C DTCG Format Reference | `text/markdown`    |

### `toki://formats`

Returns metadata for all 10 supported output formats:

```json
{
  "formats": [
    {
      "id": "css",
      "description": "CSS custom properties (:root block)",
      "namingDefault": "kebab-case",
      "artifacts": ["css/tokens.css", "css/README.md"]
    }
  ]
}
```

### `toki://token-types`

Returns all 13 W3C DTCG token types with value patterns and examples:

```json
{
  "types": [
    {
      "type": "color",
      "patterns": ["#hex (3/4/6/8 digit)", "rgb()", "rgba()", "hsl()", "hsla()", "named CSS colors"],
      "examples": ["#1a73e8", "rgb(26, 115, 232)"]
    }
  ]
}
```

### `toki://w3c-dtcg-spec`

Returns a Markdown quick reference for the W3C DTCG format covering token structure (`$value`, `$type`, `$description`, `$extensions`), group structure with `$type` inheritance, reference syntax (`{group.token}`), supported composite types, and a complete example input document.

### Dynamic resources

Dynamic resources accept parameters via URI templates. The client supplies the parameter values when reading the resource.

#### `toki://tokens/{input}`

Returns the fully resolved token list for a W3C DTCG token file. References are expanded and `$type` inheritance is applied. AI editors can read this resource as context without making a tool call.

**URI template:** `toki://tokens/{+input}`

**Parameters:**

| Parameter | Type     | Description                            |
| --------- | -------- | -------------------------------------- |
| `input`   | `string` | Path to the token file (W3C DTCG JSON) |

**Example:**

```
AI reads resource: toki://tokens/./tokens.json
← { tokenCount: 42, tokens: [{ id: "color.primary", value: "#1a73e8", type: "color", ... }, ...] }
```

Errors are returned as JSON content (not thrown), so the client always gets a readable response:

```json
{ "error": "[MISSING_REFERENCE] Token \"color.bad\" references unknown token \"{color.nope}\"." }
```

## Available prompts

Prompts are reusable message templates that AI agents can invoke with arguments.

| Prompt                | Title                                  | Arguments                                                         |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `migrate-css-tokens`  | Migrate CSS Variables to Toki          | `path` (required), `formats` (optional, default: `css,js`)        |
| `validate-tokens`     | Validate & Audit Token File            | `input` (required)                                                |
| `preview-all-formats` | Preview Token Output for All Platforms | `input` (required), `formats` (optional, default: `css,js,react`) |

### `migrate-css-tokens`

Guides the AI agent through extracting design tokens from existing CSS/SCSS files and generating a W3C DTCG token file:

```
AI: calls getPrompt("migrate-css-tokens", { path: "./src/styles", formats: "css,js,react" })
→ receives step-by-step migration instructions
→ follows: extract_tokens → organize → write tokens.json → parse_tokens → build_tokens
```

### `validate-tokens`

Guides the AI agent through a comprehensive token file audit:

```
AI: calls getPrompt("validate-tokens", { input: "./tokens.json" })
→ receives audit steps: parse, resolve, count by type, check naming, find duplicates
→ reports issues and suggests fixes
```

### `preview-all-formats`

Guides the AI agent through generating and comparing token output across platforms:

```
AI: calls getPrompt("preview-all-formats", { input: "./tokens.json", formats: "css,js,react" })
→ receives preview instructions
→ calls preview_format for each format, presents code blocks, highlights differences
```

## Programmatic usage

The MCP server can also be used as a library:

```typescript
import { createMcpServer } from '@hectorpalmatellez/toki';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const server = createMcpServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);

const client = new Client({ name: 'my-app', version: '1.0.0' });
await client.connect(clientTransport);

const result = await client.callTool({
  name: 'preview_format',
  arguments: { input: './tokens.json', format: 'css' },
});
```
