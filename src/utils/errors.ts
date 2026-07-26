/**
 * Custom error classes for the Toki pipeline.
 *
 * Errors carry a stable `code` so the CLI can format/report them consistently
 * without parsing human-readable message text. All Toki errors extend
 * `TokiError`; the CLI handler narrows via `instanceof TokiError`.
 */

export type TokiErrorCode =
  | "PARSE_ERROR"
  | "TYPE_ERROR"
  | "REFERENCE_ERROR"
  | "CIRCULAR_REFERENCE_ERROR"
  | "MISSING_REFERENCE_ERROR"
  | "GENERATOR_ERROR"
  | "IO_ERROR"
  | "CONFIG_ERROR";

export class TokiError extends Error {
  readonly code: TokiErrorCode;

  constructor(message: string, code: TokiErrorCode, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : {});
    this.name = "TokiError";
    this.code = code;
    // Maintain a proper stack trace where supported (V8).
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ParseError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "PARSE_ERROR", cause);
    this.name = "ParseError";
  }
}

export class TokenTypeError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "TYPE_ERROR", cause);
    this.name = "TokenTypeError";
  }
}

export class CircularReferenceError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "CIRCULAR_REFERENCE_ERROR", cause);
    this.name = "CircularReferenceError";
  }
}

export class MissingReferenceError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "MISSING_REFERENCE_ERROR", cause);
    this.name = "MissingReferenceError";
  }
}

export class ReferenceError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "REFERENCE_ERROR", cause);
    this.name = "ReferenceError";
  }
}

export class GeneratorError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "GENERATOR_ERROR", cause);
    this.name = "GeneratorError";
  }
}

export class IoError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "IO_ERROR", cause);
    this.name = "IoError";
  }
}

export class ConfigError extends TokiError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONFIG_ERROR", cause);
    this.name = "ConfigError";
  }
}