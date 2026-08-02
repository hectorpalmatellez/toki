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
} from './core/types.js';

export { ALL_FORMATS, TOKEN_TYPES } from './core/types.js';

export { parseTokenDocument, parseTokenTree, parseTokenJson, readTokenFile } from './core/parser.js';
export { resolveDocument, resolveTree } from './core/resolver.js';
export {
  registerTransformer,
  getTransformer,
  transformValue,
  transformToken,
  transformTokens,
  ColorTransformer,
  DimensionTransformer,
  FontWeightTransformer,
  ShadowTransformer,
  FontFamilyTransformer,
  TypographyTransformer,
  normalizeColor,
  dimensionToRn,
  dimensionToRnNumber,
  fontWeightToRn,
  fontFamilyToRn,
  typographyToRn,
  shadowToRn,
  splitColorAlpha,
  RN_REM_BASE,
} from './core/transformer.js';
export type { TransformContext, TransformFn, RnShadow } from './core/transformer.js';
export { runPipeline, generateFromDocument, generate } from './core/pipeline.js';

export { runDiff, diffTokens, formatDiffTerminal, formatDiffJson } from './core/diff.js';
export type { DiffEntry, DiffResult, DiffEntryType } from './core/diff.js';

export {
  getGenerator,
  implementedFormats,
  resolveFormats,
  parseFormats,
  ALL_FORMATS_KEYWORD,
} from './generators/index.js';
export { cssGenerator } from './generators/css.js';
export { jsGenerator } from './generators/js.js';
export { reactNativeGenerator } from './generators/react-native.js';
export { angularGenerator } from './generators/angular.js';
export { angular11Generator } from './generators/angular-11.js';
export { svelteGenerator } from './generators/svelte.js';
export { reactGenerator } from './generators/react.js';

export { TokiError } from './utils/errors.js';

export {
  extractCssProperties,
  extractScssVariables,
  inferTokenType,
  TOKEN_TYPE_PATTERNS,
  scanFiles,
} from './extractors/index.js';
export type { ExtractedToken, ScanOptions, ScanResult, TokenTypePatternInfo } from './extractors/index.js';

export { buildOutputSchema, buildOutputSchemas, generateOutputSchemas, toCssVariable } from './schemas/output.js';
export type { OutputSchema, OutputSchemaOptions, GenerateOutputSchemasOptions } from './schemas/output.js';
