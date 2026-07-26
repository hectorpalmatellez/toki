/**
 * JavaScript generator: resolved tokens →
 *   - `js/tokens.js`  — `export const camelCase = "<value>";` named exports.
 *   - `js/tokens.d.ts` — companion type declarations (`as const` inferred).
 *
 * Output rules:
 * - Carries the standard header comment.
 * - Identifiers are camelCase derived from the token path.
 * - Reserved JS keywords are escaped by appending a trailing underscore.
 * - Identifier collisions (two paths collapsing to one camelCase name) throw a
 *   `GeneratorError` so the user can rename the colliding token.
 * - Composite values are emitted as `JSON.stringify`-d `as const` literal
 *   expressions; their `.d.ts` types mirror the value shape (`readonly`).
 */

import type {
  Generator,
  GeneratorOptions,
  OutputArtifact,
  ResolvedToken,
  TokenValue,
} from "../core/types.js";
import { GeneratorError } from "../utils/errors.js";
import { toCamelCase } from "../utils/naming.js";
import { headerComment } from "../utils/format.js";

/** JS reserved words that cannot be used as binding identifiers. */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "null",
  "true",
  "false",
  "undefined",
  "await",
  "enum",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "static",
]);

const makeIdentifier = (path: readonly string[]): string => {
  let id = toCamelCase(path);
  if (id.length === 0) id = "token";
  if (/^[0-9]/.test(id)) id = `_${id}`;
  if (RESERVED_WORDS.has(id)) id = `${id}_`;
  return id;
};

/** Format a resolved value as a JS literal expression. */
export const formatJsLiteral = (value: TokenValue): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(sortKeys(value));
};

/** Infer a TypeScript type literal string for a resolved value. */
export const inferJsType = (value: unknown): string => {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "null";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.length === 0) return "readonly unknown[]";
    return `readonly [${value.map(inferJsType).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).toSorted();
    const props = keys
      .map((k) => `${JSON.stringify(k)}: ${inferJsType(obj[k])}`)
      .join("; ");
    return `{ readonly ${props} }`;
  }
  return "unknown";
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).toSorted()) out[key] = sortKeys(obj[key]);
    return out;
  }
  return value;
};

export const jsGenerator: Generator = {
  format: "js",
  generate: (
    _tokens: readonly ResolvedToken[],
    _options: GeneratorOptions,
  ): readonly OutputArtifact[] => {
    return generateJs(_tokens, _options);
  },
};

const generateJs = (
  tokens: readonly ResolvedToken[],
  options: GeneratorOptions,
): readonly OutputArtifact[] => {
  const seen = new Map<string, string>();
  const exports: string[] = [];
  const decls: string[] = [];

  for (const token of tokens) {
    const identifier = makeIdentifier(token.path);
    const collision = seen.get(identifier);
    if (collision !== undefined) {
      throw new GeneratorError(
        `Identifier collision: tokens "${collision}" and "${token.id}" both map to ` +
          `export name "${identifier}". Rename one of the tokens.`,
      );
    }
    seen.set(identifier, token.id);

    const literal = formatJsLiteral(token.value);
    exports.push(`export const ${identifier} = ${literal};`);
    decls.push(`export declare const ${identifier}: ${inferJsType(token.value)};`);
  }

  const header = headerComment(options.version);
  const jsContent = [header, "", ...exports, ""].join("\n");
  const dtsContent = [header, "", ...decls, ""].join("\n");

  return [
    { relativePath: "js/tokens.js", format: "js", content: jsContent },
    { relativePath: "js/tokens.d.ts", format: "js", content: dtsContent },
  ];
};