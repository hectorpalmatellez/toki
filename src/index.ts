// Toki — public barrel export.
//
// Programmatic API for using Toki as a library (parse → resolve → generate in
// memory). The CLI entry (`src/cli.ts`) is kept separate so importing this
// barrel does not parse `process.argv`.

export type {
  TokenType,
  TokenValue,
  TokenComposite,
  TokenNode,
  TokenGroupNode,
  DesignToken,
  TokenTree,
  DesignTokenDocument,
  ResolvedToken,
  OutputFormat,
  OutputArtifact,
  Generator,
  GeneratorOptions,
} from "./core/types.js";

export { ALL_FORMATS, TOKEN_TYPES } from "./core/types.js";

export { parseTokenDocument, parseTokenTree, parseTokenJson, readTokenFile } from "./core/parser.js";
export { resolveDocument, resolveTree } from "./core/resolver.js";
export { runPipeline, generateFromDocument, generate } from "./core/pipeline.js";

export { getGenerator, implementedFormats, resolveFormats } from "./generators/index.js";
export { cssGenerator } from "./generators/css.js";
export { jsGenerator } from "./generators/js.js";

export { TokiError } from "./utils/errors.js";