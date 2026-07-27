import type { TokenType } from '../core/types.js';

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\s*\(/i;
const HSL = /^hsla?\s*\(/i;
const PX = /^-?\d+(?:\.\d+)?px$/i;
const REM = /^-?\d+(?:\.\d+)?(?:rem|em)$/i;
const DURATION = /^-?\d+(?:\.\d+)?(?:ms|s)$/i;
const BARE_NUMBER = /^-?\d+(?:\.\d+)?$/;
const FONT_WEIGHT_NUMERIC = /^(100|200|300|400|500|600|700|800|900)$/;
const FONT_WEIGHT_KEYWORDS = new Set(['normal', 'bold', 'lighter', 'bolder']);
const FONT_FAMILY_GENERIC = /(?:sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-|Noto|Helvetica|Arial|Georgia|Verdana|Times|Courier|Inter|Roboto|Open Sans|Fira)/i;

const NAMED_COLORS = new Set([
  'transparent', 'currentcolor', 'inherit',
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
  'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet',
  'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate',
  'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan',
  'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen',
  'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange',
  'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue',
  'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet',
  'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory',
  'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon',
  'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow',
  'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
  'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid',
  'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
  'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive',
  'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip',
  'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
  'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato',
  'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
  'yellowgreen',
]);

export const inferTokenType = (value: string): TokenType | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  if (HEX.test(trimmed)) return 'color';
  if (RGB.test(trimmed)) return 'color';
  if (HSL.test(trimmed)) return 'color';
  if (NAMED_COLORS.has(trimmed.toLowerCase())) return 'color';

  if (PX.test(trimmed)) return 'dimension';
  if (REM.test(trimmed)) return 'dimension';

  if (DURATION.test(trimmed)) return 'duration';

  if (FONT_WEIGHT_NUMERIC.test(trimmed)) return 'fontWeight';
  if (FONT_WEIGHT_KEYWORDS.has(trimmed.toLowerCase())) return 'fontWeight';

  if (FONT_FAMILY_GENERIC.test(trimmed) && trimmed.includes(',')) return 'fontFamily';
  if (/^(?:["'][^"']+["'](?:\s*,\s*["'][^"']+["'])*)$/.test(trimmed)) return 'fontFamily';

  if (BARE_NUMBER.test(trimmed)) return 'number';

  return undefined;
};

export interface TokenTypePatternInfo {
  readonly description: string;
  readonly patterns: readonly string[];
  readonly examples: readonly string[];
}

export const TOKEN_TYPE_PATTERNS: Readonly<Record<string, TokenTypePatternInfo>> = {
  color: {
    description: 'Color values in various CSS formats',
    patterns: ['#hex (3/4/6/8 digit)', 'rgb()', 'rgba()', 'hsl()', 'hsla()', 'named CSS colors'],
    examples: ['#1a73e8', '#aabbccdd', 'rgb(26, 115, 232)', 'hsl(214, 81%, 53%)', 'rebeccapurple'],
  },
  dimension: {
    description: 'Length/size values with CSS units',
    patterns: ['Npx', 'Nrem', 'Nem'],
    examples: ['16px', '1rem', '0.5em', '-4px'],
  },
  fontFamily: {
    description: 'Font family names (typically comma-separated lists)',
    patterns: ['Comma-separated font names', 'Quoted font family strings'],
    examples: ['Inter, sans-serif', '"Helvetica Neue", Arial, sans-serif'],
  },
  fontWeight: {
    description: 'Font weight as numeric values or keywords',
    patterns: ['100-900 (multiples of 100)', 'normal', 'bold', 'lighter', 'bolder'],
    examples: ['400', '700', 'normal', 'bold'],
  },
  duration: {
    description: 'Time values for animations and transitions',
    patterns: ['Nms', 'Ns'],
    examples: ['300ms', '0.3s', '1.5s'],
  },
  number: {
    description: 'Unitless numeric values (line-height, opacity, z-index, etc.)',
    patterns: ['Integer or decimal without units'],
    examples: ['1.5', '42', '0.85', '-1'],
  },
  letterSpacing: {
    description: 'Letter spacing values (typically dimension-like)',
    patterns: ['Npx', 'Nrem', 'Nem', 'Nem'],
    examples: ['0.5px', '0.02em', '-0.01em'],
  },
  lineHeight: {
    description: 'Line height as unitless number or dimension',
    patterns: ['Unitless number', 'Npx', 'Nrem', 'Nem'],
    examples: ['1.5', '24px', '1.75rem'],
  },
  cubicBezier: {
    description: 'Cubic bezier timing function control points',
    patterns: ['cubic-bezier(x1, y1, x2, y2)'],
    examples: ['cubic-bezier(0.4, 0, 0.2, 1)'],
  },
  shadow: {
    description: 'Box shadow or text shadow composite values',
    patterns: ['CSS shadow syntax: offsetX offsetY blur? spread? color?'],
    examples: ['0 4px 6px rgba(0, 0, 0, 0.1)', '0 2px 4px 0 #0000001a'],
  },
  typography: {
    description: 'Composite typography token (object with fontFamily, fontSize, fontWeight, lineHeight)',
    patterns: ['Object with font-related fields'],
    examples: ['{ fontFamily: "Inter", fontSize: "16px", fontWeight: "400", lineHeight: "1.5" }'],
  },
  border: {
    description: 'Composite border token (width, style, color)',
    patterns: ['CSS border shorthand or object'],
    examples: ['1px solid #e0e0e0', '{ width: "1px", style: "solid", color: "#e0e0e0" }'],
  },
  transition: {
    description: 'Composite transition token (property, duration, timing, delay)',
    patterns: ['CSS transition shorthand or object'],
    examples: ['all 0.3s ease', '{ property: "opacity", duration: "300ms", timing: "ease-in-out" }'],
  },
};
