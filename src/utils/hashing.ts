/**
 * Deterministic hashing helpers.
 *
 * `canonicalJson` produces a stable serialization (recursively sorted object
 * keys, compact form) so hashes of the same logical data are byte-identical
 * regardless of insertion order — the foundation of the incremental build
 * cache and any future checksum manifest.
 */

import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a UTF-8 string. */
export const sha256 = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

/** Deterministic, compact JSON serialization with recursively sorted keys. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).toSorted();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
