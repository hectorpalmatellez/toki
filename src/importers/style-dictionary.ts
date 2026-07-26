/**
 * Style Dictionary importer: reads Style Dictionary v3 format and converts
 * to W3C DTCG format.
 *
 * Usage: `toki import --from style-dictionary --input sd-config.json`
 *
 * Style Dictionary format:
 * ```json
 * {
 *   "color": {
 *     "primary": {
 *       "value": "#1a73e8",
 *       "type": "color",
 *       "comment": "Primary brand color"
 *     }
 *   }
 * }
 * ```
 *
 * Conversion rules:
 * - `value` → `$value`
 * - `type` → `$type`
 * - `comment` → `$description`
 * - `{group.token}` reference syntax is preserved (same as DTCG)
 * - Nested group structure is preserved
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { TOKEN_TYPES } from "../core/types.js";
import type { TokenType } from "../core/types.js";
import { ImportError } from "../utils/errors.js";

/** Style Dictionary token object shape. */
interface SdToken {
  value?: unknown;
  type?: string;
  comment?: string;
  description?: string;
  [key: string]: unknown;
}

/** Style Dictionary input — a nested object of groups and tokens. */
type SdNode = SdToken | Record<string, unknown>;

const isSdToken = (node: SdNode): boolean => {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  return "value" in node;
};

const isValidType = (type: string): type is TokenType => TOKEN_TYPES.has(type);

/**
 * Convert a Style Dictionary node to W3C DTCG format recursively.
 * Returns the converted node (a DTCG group or token).
 */
const convertNode = (node: SdNode, path: readonly string[]): Record<string, unknown> => {
  if (isSdToken(node)) {
    return convertToken(node, path);
  }
  return convertGroup(node, path);
};

/**
 * Convert a single Style Dictionary token to DTCG format.
 */
const convertToken = (node: SdToken, path: readonly string[]): Record<string, unknown> => {
  if (node.value === undefined) {
    throw new ImportError(
      `Token at "${path.join(".")}" is missing a "value" property.`,
    );
  }

  const result: Record<string, unknown> = {
    $value: node.value,
  };

  // Validate and map type
  if (node.type !== undefined) {
    if (typeof node.type !== "string") {
      throw new ImportError(
        `Token at "${path.join(".")}" has an invalid "type" property (expected a string).`,
      );
    }
    if (!isValidType(node.type)) {
      throw new ImportError(
        `Token at "${path.join(".")}" has an unknown type "${node.type}". ` +
          `Supported types: ${[...TOKEN_TYPES].join(", ")}.`,
      );
    }
    result["$type"] = node.type as TokenType;
  }

  // Map comment → $description (SD uses "comment", DTCG uses "$description")
  const description = node.comment ?? node.description;
  if (typeof description === "string") {
    result["$description"] = description;
  }

  // Preserve $extensions if present
  const extensions = node["$extensions"];
  if (extensions !== undefined && typeof extensions === "object" && extensions !== null) {
    result["$extensions"] = extensions;
  }

  return result;
};

/**
 * Convert a Style Dictionary group to DTCG format recursively.
 */
const convertGroup = (node: SdNode, path: readonly string[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  // Group-level $type: SD uses "type", DTCG uses "$type"
  const groupType = node.type ?? node["$type"];
  if (groupType !== undefined) {
    if (typeof groupType !== "string") {
      throw new ImportError(
        `Group at "${path.join(".")}" has an invalid "type" property.`,
      );
    }
    if (!isValidType(groupType)) {
      throw new ImportError(
        `Group at "${path.join(".")}" has an unknown type "${groupType}".`,
      );
    }
    result["$type"] = groupType as TokenType;
  }

  // Group-level $description
  const description = node.comment ?? node.description;
  if (typeof description === "string") {
    result["$description"] = description;
  }

  // Group-level $extensions
  const extensions = node["$extensions"];
  if (extensions !== undefined && typeof extensions === "object" && extensions !== null) {
    result["$extensions"] = extensions;
  }

  // Convert children
  const reserved = new Set(["value", "type", "comment", "description", "$type", "$description", "$extensions"]);
  for (const [key, child] of Object.entries(node)) {
    if (reserved.has(key)) continue;
    if (child === null || typeof child !== "object" || Array.isArray(child)) {
      throw new ImportError(
        `Group at "${path.join(".")}" has a non-object child "${key}".`,
      );
    }
    result[key] = convertNode(child as SdNode, [...path, key]);
  }

  return result;
};

/**
 * Convert a Style Dictionary JSON object to W3C DTCG format.
 * Returns the DTCG-compatible object ready to be stringified.
 */
export const convertStyleDictionary = (input: unknown): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ImportError("Style Dictionary input must be a JSON object.");
  }

  return convertNode(input as SdNode, []) as Record<string, unknown>;
};

/**
 * Import a Style Dictionary file, convert to DTCG, and write to disk.
 */
export const importStyleDictionary = async (options: {
  readonly input: string;
  readonly output?: string;
}): Promise<string> => {
  const inputPath = resolve(options.input);

  let raw: string;
  try {
    raw = await readFile(inputPath, "utf8");
  } catch (cause) {
    throw new ImportError(`Failed to read file: ${inputPath}`, cause);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new ImportError(`Invalid JSON in ${inputPath}: ${cause instanceof Error ? cause.message : String(cause)}`, cause);
  }

  const dtcg = convertStyleDictionary(parsed);

  const outputPath = resolve(options.output ?? dirname(inputPath), "tokens.json");

  try {
    await writeFile(outputPath, JSON.stringify(dtcg, null, 2) + "\n", "utf8");
  } catch (cause) {
    throw new ImportError(`Failed to write output: ${outputPath}`, cause);
  }

  return outputPath;
};
