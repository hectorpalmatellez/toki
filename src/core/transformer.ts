/**
 * Value transformer registry: converts resolved token values into
 * platform-appropriate formats before generation.
 *
 * This is the `Transform` stage of the pipeline:
 *
 *   Parse → Resolve → Transform → Generate → Write
 *
 * Transformers are keyed by `TokenType` and receive the target platform, so a
 * single token set can fan out to platform-specific representations:
 *
 * - {@link ColorTransformer}     — normalizes hex colors (expands shorthand,
 *   lowercases) so every platform receives a canonical color string.
 * - {@link DimensionTransformer} — for `react-native`, converts `"8px"` → `8`
 *   (raw dp) and `"1.5rem"` → `24`; other platforms keep the authored string.
 * - {@link FontWeightTransformer} — for `react-native`, canonicalizes weights
 *   to the string form RN expects (`"bold"` → `"700"`, `400` → `"400"`).
 * - {@link ShadowTransformer}     — for `react-native`, converts DTCG shadow
 *   objects to RN `{ shadowColor, shadowOffset, shadowOpacity, shadowRadius }`.
 *
 * The pipeline applies {@link transformTokens} per format before invoking the
 * generator. Generators still tolerate raw values when called directly (as in
 * unit tests), because transformers for `css`/`js` are effectively identity.
 */

import type { OutputFormat, ResolvedToken, TokenType, TokenValue, TransformContext } from './types.js';

export type { TransformContext } from './types.js';

/** A value transformer: maps a resolved token to its platform value. */
export type TransformFn = (token: ResolvedToken, context: TransformContext) => TokenValue;

const registry = new Map<TokenType, TransformFn>();

/** Register (or replace) the transformer for a token type. */
export const registerTransformer = (type: TokenType, fn: TransformFn): void => {
  registry.set(type, fn);
};

/** Look up the transformer registered for a token type. */
export const getTransformer = (type: TokenType): TransformFn | undefined => registry.get(type);

/** Apply the registered transformer for `token.type`, or return the raw value. */
export const transformValue = (token: ResolvedToken, context: TransformContext): TokenValue =>
  registry.get(token.type)?.(token, context) ?? token.value;

/** Return a copy of `token` with its value transformed for `context.platform`. */
export const transformToken = (token: ResolvedToken, context: TransformContext): ResolvedToken => ({
  ...token,
  value: transformValue(token, context),
});

/** Transform a whole token list for one platform (pipeline Transform stage). */
export const transformTokens = (tokens: readonly ResolvedToken[], platform: OutputFormat): readonly ResolvedToken[] =>
  tokens.map((token) => transformToken(token, { platform }));

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

const HEX_SHORT = /^#([0-9a-f]{3}|[0-9a-f]{4})$/i;
const HEX_LONG = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Normalize a color string to a canonical form accepted by every platform:
 * - `#abc` → `#aabbcc`, `#abcd` → `#aabbccdd` (shorthand expansion)
 * - uppercase hex → lowercase
 * - anything else (`rgb()`, `hsl()`, named colors, non-strings) passes through
 */
export const normalizeColor = (value: string): string => {
  const short = HEX_SHORT.exec(value);
  if (short !== null) {
    const digits = short[1] as string;
    const expanded = [...digits].map((ch) => ch + ch).join('');
    return `#${expanded.toLowerCase()}`;
  }
  if (HEX_LONG.test(value)) return value.toLowerCase();
  return value;
};

// ---------------------------------------------------------------------------
// Dimension (React Native raw numbers)
// ---------------------------------------------------------------------------

/** Base font size used to convert `rem`/`em` to raw numbers (1rem = 16px). */
export const RN_REM_BASE = 16;

const PX = /^(-?\d+(?:\.\d+)?)px$/i;
const REM = /^(-?\d+(?:\.\d+)?)(?:rem|em)$/i;
const BARE_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Convert a dimension value to a React Native raw number (dp / sp):
 * - `8` → `8`, `"8px"` → `8`, `"1.5rem"`/`"1.5em"` → `24`, `"8"` → `8`
 * - non-convertible strings (`"50%"`, `"auto"`) pass through unchanged.
 */
export const dimensionToRn = (value: TokenValue): TokenValue => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const px = PX.exec(trimmed);
  if (px !== null) return Number(px[1]);
  const rem = REM.exec(trimmed);
  if (rem !== null) return Number(rem[1]) * RN_REM_BASE;
  if (BARE_NUMBER.test(trimmed)) return Number(trimmed);
  return value;
};

/**
 * Strict numeric conversion for composite fields (shadow offsets, typography
 * sizes): non-convertible values become `0`.
 */
export const dimensionToRnNumber = (value: unknown): number => {
  const converted = dimensionToRn(value as TokenValue);
  return typeof converted === 'number' ? converted : 0;
};

// ---------------------------------------------------------------------------
// Font weight (React Native canonical strings)
// ---------------------------------------------------------------------------

const FONT_WEIGHT_KEYWORDS: Readonly<Record<string, string>> = {
  normal: '400',
  bold: '700',
};

/**
 * Convert a fontWeight value to the string form React Native expects:
 * - `"normal"` → `"400"`, `"bold"` → `"700"`
 * - `400` → `"400"`, `"600"` → `"600"`
 * - unrecognized strings pass through unchanged.
 */
export const fontWeightToRn = (value: TokenValue): TokenValue => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return value;
  const keyword = FONT_WEIGHT_KEYWORDS[value.trim().toLowerCase()];
  if (keyword !== undefined) return keyword;
  if (BARE_NUMBER.test(value.trim())) return String(Number(value.trim()));
  return value;
};

// ---------------------------------------------------------------------------
// Shadow (React Native shadow object)
// ---------------------------------------------------------------------------

/** React Native shadow representation produced by {@link shadowToRn}. */
export interface RnShadow extends Record<string, unknown> {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  /** Android-only elevation heuristic: `max(1, round(shadowRadius))`. */
  readonly elevation: number;
}

const RGBA = /^rgba?\(\s*([^)]+?)\s*\)$/i;

/** Split a color into its opaque base + alpha channel (defaults to 1). */
export const splitColorAlpha = (color: string): { base: string; alpha: number } => {
  const normalized = normalizeColor(color);
  // 8-digit hex: #rrggbbaa
  if (/^#[0-9a-f]{8}$/.test(normalized)) {
    const alpha = parseInt(normalized.slice(7, 9), 16) / 255;
    return { base: normalized.slice(0, 7), alpha: Math.round(alpha * 100) / 100 };
  }
  // rgb()/rgba()
  const fn = RGBA.exec(normalized);
  if (fn !== null) {
    const parts = (fn[1] as string).split(',').map((part) => part.trim());
    if (parts.length === 4) {
      const alpha = Number(parts[3]);
      if (Number.isFinite(alpha)) {
        return {
          base: `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`,
          alpha: Math.round(alpha * 100) / 100,
        };
      }
    }
    return { base: normalized, alpha: 1 };
  }
  return { base: normalized, alpha: 1 };
};

/** Convert a single DTCG shadow object to the React Native shape. */
const singleShadowToRn = (value: Readonly<Record<string, unknown>>): RnShadow => {
  const width = dimensionToRnNumber(value['x'] ?? 0);
  const height = dimensionToRnNumber(value['y'] ?? 0);
  const blur = dimensionToRnNumber(value['blur'] ?? 0);
  const { base, alpha } =
    typeof value['color'] === 'string' ? splitColorAlpha(value['color']) : { base: '#000000', alpha: 1 };
  const shadowRadius = Math.round((blur / 2) * 100) / 100;
  return {
    shadowColor: base,
    shadowOffset: { width, height },
    shadowOpacity: alpha,
    shadowRadius,
    elevation: Math.max(1, Math.round(shadowRadius)),
  };
};

/**
 * Convert a DTCG `shadow` value to React Native form. A single shadow object
 * becomes an {@link RnShadow}; a multi-shadow array becomes an array of them
 * (RN only supports one shadow per node — consumers pick an entry).
 * Non-object values pass through unchanged.
 */
export const shadowToRn = (value: TokenValue): TokenValue => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
        ? singleShadowToRn(entry as Readonly<Record<string, unknown>>)
        : entry,
    );
  }
  if (value !== null && typeof value === 'object') {
    return singleShadowToRn(value as Readonly<Record<string, unknown>>);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Typography / fontFamily (React Native composite + family-name handling)
// ---------------------------------------------------------------------------

/**
 * Extract the first family name from a CSS font-family list: RN `fontFamily`
 * accepts a single family, so `"Inter, sans-serif"` → `"Inter"` (quotes
 * stripped). Non-strings pass through.
 */
export const fontFamilyToRn = (value: TokenValue): TokenValue => {
  if (typeof value !== 'string') return value;
  const first = value.split(',')[0]?.trim() ?? value;
  return first.replace(/^["']+|["']+$/g, '');
};

/**
 * Normalize the fields of a DTCG `typography` composite for React Native:
 * `fontSize` / `lineHeight` / `letterSpacing` become raw numbers (via
 * {@link dimensionToRn}), `fontWeight` becomes the canonical RN string, and
 * `fontFamily` is reduced to its first family name. Unknown fields and
 * non-object values pass through unchanged.
 */
export const typographyToRn = (value: TokenValue): TokenValue => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const field = source[key] as TokenValue;
    switch (key) {
      case 'fontSize':
      case 'lineHeight':
      case 'letterSpacing':
        out[key] = dimensionToRn(field);
        break;
      case 'fontWeight':
        out[key] = fontWeightToRn(field);
        break;
      case 'fontFamily':
        out[key] = fontFamilyToRn(field);
        break;
      default:
        out[key] = field;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Named transformers (registered by default)
// ---------------------------------------------------------------------------

/** Color: canonicalize hex strings for every platform. */
export const ColorTransformer: TransformFn = (token) =>
  typeof token.value === 'string' ? normalizeColor(token.value) : token.value;

/** Dimension: raw numbers for React Native; authored strings elsewhere. */
export const DimensionTransformer: TransformFn = (token, context) =>
  context.platform === 'react-native' ? dimensionToRn(token.value) : token.value;

/** FontWeight: canonical numeric strings for React Native; as-is elsewhere. */
export const FontWeightTransformer: TransformFn = (token, context) =>
  context.platform === 'react-native' ? fontWeightToRn(token.value) : token.value;

/** Shadow: RN shadow objects for React Native; as-is elsewhere. */
export const ShadowTransformer: TransformFn = (token, context) =>
  context.platform === 'react-native' ? shadowToRn(token.value) : token.value;

/** FontFamily: first family name for React Native; as-is elsewhere. */
export const FontFamilyTransformer: TransformFn = (token, context) =>
  context.platform === 'react-native' ? fontFamilyToRn(token.value) : token.value;

/** Typography: RN-normalized composite fields for React Native; as-is elsewhere. */
export const TypographyTransformer: TransformFn = (token, context) =>
  context.platform === 'react-native' ? typographyToRn(token.value) : token.value;

registerTransformer('color', ColorTransformer);
registerTransformer('dimension', DimensionTransformer);
registerTransformer('fontWeight', FontWeightTransformer);
registerTransformer('shadow', ShadowTransformer);
registerTransformer('fontFamily', FontFamilyTransformer);
registerTransformer('typography', TypographyTransformer);
