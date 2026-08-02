/**
 * UI token model: the friendly, type-aware representation of W3C DTCG tokens
 * used by the `toki ui` editor.
 *
 * The editor works with a flat list of tokens (`FlatToken`), each carrying a
 * type, a group key, and a name. Serialization helpers convert between this
 * flat model and the nested DTCG tree on disk (`extractTokens` / `buildTree`),
 * and between raw `$value`s and structured editor forms (`valueToForm` /
 * `formToValue`).
 *
 * This module is pure (no DOM, no Node I/O) so it can be bundled into the
 * browser app and unit-tested in Node.
 */

import type { TokenType } from '../core/types.js';
import { TOKEN_TYPES } from '../core/types.js';
import { inferTokenType } from '../extractors/infer-type.js';

// ---------------------------------------------------------------------------
// Flat model
// ---------------------------------------------------------------------------

/** A token as edited in the UI: a type, a group key, and a name. */
export interface FlatToken {
  /** First path segment in the DTCG tree (e.g. `color`). */
  readonly group: string;
  /** Remaining path segments joined with `.` (e.g. `primary` or `dark.primary`). */
  readonly name: string;
  readonly type: TokenType;
  /** Raw DTCG `$value` (may be a string, number, array, or object). */
  readonly value: unknown;
  readonly description?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isTokenType = (value: unknown): value is TokenType => typeof value === 'string' && TOKEN_TYPES.has(value);

/** String form of a raw value, used for the raw editor fallback. */
export const valueToRawText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * Parse raw editor text back into a token value: JSON when it parses as such
 * (arrays/objects/numbers), otherwise the plain string (references included).
 */
export const parseRawValue = (text: string): unknown => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed;
  } catch {
    return text;
  }
};

/**
 * Flatten a parsed DTCG tree into `FlatToken`s in document order.
 *
 * `$type` inheritance is honored: a token's type is its own explicit `$type`,
 * otherwise the nearest ancestor group's, otherwise inferred from the value.
 * Groups deeper than the root are folded into the token name (`dark.primary`).
 */
export const extractTokens = (tree: unknown): readonly FlatToken[] => {
  const out: FlatToken[] = [];

  const walk = (node: Record<string, unknown>, path: readonly string[], inherited: TokenType | undefined): void => {
    const groupType = isTokenType(node['$type']) ? node['$type'] : inherited;
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      if (!isRecord(value)) continue;
      const childPath = [...path, key];
      if ('$value' in value) {
        const explicit = isTokenType(value['$type']) ? value['$type'] : undefined;
        const type = explicit ?? groupType ?? inferTokenType(valueToRawText(value['$value'])) ?? 'number';
        const description = typeof value['$description'] === 'string' ? value['$description'] : undefined;
        out.push({
          group: childPath.length > 1 ? (childPath[0] ?? 'tokens') : 'tokens',
          name: childPath.length > 1 ? childPath.slice(1).join('.') : key,
          type,
          value: value['$value'],
          ...(description !== undefined ? { description } : {}),
        });
      } else {
        walk(value, childPath, groupType);
      }
    }
  };

  if (isRecord(tree)) walk(tree, [], undefined);
  return out;
};

/**
 * Rebuild a DTCG tree from flat tokens. Tokens are grouped under their group
 * key and always carry an explicit `$type` so the round trip is lossless
 * (group-level `$type` inheritance is normalized into the tokens).
 */
export const buildTree = (tokens: readonly FlatToken[]): Record<string, unknown> => {
  const tree: Record<string, unknown> = {};
  for (const token of tokens) {
    const key = token.group.length > 0 ? token.group : 'tokens';
    const group = tree[key] as Record<string, unknown> | undefined;
    const node: Record<string, unknown> = { $value: token.value, $type: token.type };
    if (token.description !== undefined && token.description !== '') {
      node['$description'] = token.description;
    }
    if (group === undefined) {
      tree[key] = { [token.name]: node };
    } else {
      group[token.name] = node;
    }
  }
  return tree;
};

// ---------------------------------------------------------------------------
// Structured editor forms
// ---------------------------------------------------------------------------

export type FieldKind = 'text' | 'number' | 'color' | 'select' | 'unit' | 'checkbox';

/** A single input field in a structured token form. */
export interface FieldSpec {
  /** Key used in the form object returned by `toForm`/passed to `fromForm`. */
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly placeholder?: string;
  /** Options for `select` fields. */
  readonly options?: readonly string[];
  /** Fixed unit suffix rendered next to `number` fields. */
  readonly unit?: string;
  /** Selectable units for `unit` fields. */
  readonly units?: readonly string[];
  readonly step?: string;
  /** Render the field on its own row. */
  readonly full?: boolean;
  /** Default value when the field is missing from a loaded value. */
  readonly default?: string;
}

/** A form object as read from / written to the DOM (string-or-boolean fields). */
export type TokenForm = Record<string, string | boolean>;

/** Editor specification for one token type. */
export interface TypeSpec {
  readonly type: TokenType;
  /** Friendly section label, e.g. "Spacing & Sizes". */
  readonly label: string;
  /** Default group key for new tokens of this type. */
  readonly defaultGroup: string;
  /** Value used for newly created tokens. */
  readonly defaultValue: unknown;
  readonly fields: readonly FieldSpec[];
  /** Convert a raw `$value` into a form; `null` → raw text editor. */
  readonly toForm: (value: unknown) => TokenForm | null;
  /** Convert a form back into a raw `$value`. */
  readonly fromForm: (form: TokenForm) => unknown;
}

const NUM_UNIT_RE = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|ms|s)$/;

const splitNumUnit = (value: unknown): { n: string; unit: string } | null => {
  if (typeof value !== 'string') return null;
  const match = NUM_UNIT_RE.exec(value);
  if (match === null) return null;
  return { n: match[1] ?? '', unit: match[2] ?? '' };
};

const joinNumUnit = (n: string, unit: string): string => `${n.trim()}${unit}`;

const formString = (form: TokenForm, key: string): string => {
  const value = form[key];
  return typeof value === 'string' ? value : '';
};

const formBoolean = (form: TokenForm, key: string): boolean => form[key] === true;

/** `number`-typed form field with optional fixed unit suffix. */
const NUM: Omit<FieldSpec, 'key' | 'label'> = { kind: 'number', step: 'any' };

/** `unit`-typed form field (paired with a `number` field via `unitKey`). */
const UNIT = (units: readonly string[]): Omit<FieldSpec, 'key' | 'label'> => ({
  kind: 'unit',
  units,
});

const COLOR_FIELD: Omit<FieldSpec, 'key' | 'label'> = { kind: 'color' };

/** Type spec table in editor order (friendly-first). */
export const TYPE_SPECS: readonly TypeSpec[] = [
  {
    type: 'color',
    label: 'Colors',
    defaultGroup: 'color',
    defaultValue: '#1a73e8',
    fields: [{ ...COLOR_FIELD, key: 'color', label: 'Color', full: true }],
    toForm: (value) => (typeof value === 'string' && value.startsWith('#') ? { color: value } : null),
    fromForm: (form) => formString(form, 'color'),
  },
  {
    type: 'dimension',
    label: 'Spacing & Sizes',
    defaultGroup: 'spacing',
    defaultValue: '8px',
    fields: [
      { ...NUM, key: 'n', label: 'Size', placeholder: '8' },
      { ...UNIT(['px', 'rem', 'em', '%']), key: 'unit', label: 'Unit' },
    ],
    toForm: (value) => {
      const split = splitNumUnit(value);
      return split !== null ? { n: split.n, unit: split.unit } : null;
    },
    fromForm: (form) => joinNumUnit(formString(form, 'n'), formString(form, 'unit') || 'px'),
  },
  {
    type: 'typography',
    label: 'Typography',
    defaultGroup: 'typography',
    defaultValue: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '1.5',
    },
    fields: [
      { kind: 'text', key: 'fontFamily', label: 'Font family', placeholder: 'Inter, sans-serif', full: true },
      { ...NUM, key: 'fontSizeN', label: 'Font size', placeholder: '16' },
      { ...UNIT(['px', 'rem', 'em']), key: 'fontSizeUnit', label: 'Unit' },
      { kind: 'text', key: 'fontWeight', label: 'Weight', placeholder: '400', default: '400' },
      { kind: 'text', key: 'lineHeight', label: 'Line height', placeholder: '1.5', default: '1.5' },
    ],
    toForm: (value) => {
      if (!isRecord(value)) return null;
      const fontFamily = typeof value['fontFamily'] === 'string' ? value['fontFamily'] : '';
      const fontSize = typeof value['fontSize'] === 'string' ? value['fontSize'] : undefined;
      const split = fontSize !== undefined ? splitNumUnit(fontSize) : undefined;
      return {
        fontFamily,
        fontSizeN: split?.n ?? '',
        fontSizeUnit: split?.unit ?? 'px',
        fontWeight:
          typeof value['fontWeight'] === 'string' || typeof value['fontWeight'] === 'number'
            ? String(value['fontWeight'])
            : '400',
        lineHeight:
          typeof value['lineHeight'] === 'string' || typeof value['lineHeight'] === 'number'
            ? String(value['lineHeight'])
            : '1.5',
      };
    },
    fromForm: (form) => ({
      fontFamily: formString(form, 'fontFamily'),
      fontSize: joinNumUnit(formString(form, 'fontSizeN'), formString(form, 'fontSizeUnit') || 'px'),
      fontWeight: formString(form, 'fontWeight') || '400',
      lineHeight: formString(form, 'lineHeight') || '1.5',
    }),
  },
  {
    type: 'fontFamily',
    label: 'Font Families',
    defaultGroup: 'font',
    defaultValue: 'Inter, sans-serif',
    fields: [{ kind: 'text', key: 'value', label: 'Font family', placeholder: 'Inter, sans-serif', full: true }],
    toForm: (value) => (typeof value === 'string' ? { value } : null),
    fromForm: (form) => formString(form, 'value'),
  },
  {
    type: 'fontWeight',
    label: 'Font Weights',
    defaultGroup: 'font-weight',
    defaultValue: '400',
    fields: [{ kind: 'text', key: 'value', label: 'Weight', placeholder: '400', full: true }],
    toForm: (value) => (typeof value === 'string' || typeof value === 'number' ? { value: String(value) } : null),
    fromForm: (form) => formString(form, 'value'),
  },
  {
    type: 'duration',
    label: 'Durations',
    defaultGroup: 'duration',
    defaultValue: '200ms',
    fields: [
      { ...NUM, key: 'n', label: 'Duration', placeholder: '200' },
      { ...UNIT(['ms', 's']), key: 'unit', label: 'Unit' },
    ],
    toForm: (value) => {
      const split = splitNumUnit(value);
      return split !== null ? { n: split.n, unit: split.unit } : null;
    },
    fromForm: (form) => joinNumUnit(formString(form, 'n'), formString(form, 'unit') || 'ms'),
  },
  {
    type: 'number',
    label: 'Numbers',
    defaultGroup: 'number',
    defaultValue: 0,
    fields: [{ ...NUM, key: 'n', label: 'Number', placeholder: '0', full: true }],
    toForm: (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return { n: String(value) };
      if (typeof value === 'string' && value.trim().length > 0) return { n: value };
      return null;
    },
    fromForm: (form) => {
      const n = formString(form, 'n');
      return n.trim().length > 0 ? Number(n) : '';
    },
  },
  {
    type: 'lineHeight',
    label: 'Line Heights',
    defaultGroup: 'line-height',
    defaultValue: '1.5',
    fields: [{ kind: 'text', key: 'value', label: 'Line height', placeholder: '1.5 or 24px', full: true }],
    toForm: (value) => (typeof value === 'string' || typeof value === 'number' ? { value: String(value) } : null),
    fromForm: (form) => formString(form, 'value'),
  },
  {
    type: 'letterSpacing',
    label: 'Letter Spacing',
    defaultGroup: 'letter-spacing',
    defaultValue: '0.02em',
    fields: [
      { ...NUM, key: 'n', label: 'Spacing', placeholder: '0.02' },
      { ...UNIT(['em', 'px']), key: 'unit', label: 'Unit' },
    ],
    toForm: (value) => {
      const split = splitNumUnit(value);
      return split !== null ? { n: split.n, unit: split.unit } : null;
    },
    fromForm: (form) => joinNumUnit(formString(form, 'n'), formString(form, 'unit') || 'em'),
  },
  {
    type: 'cubicBezier',
    label: 'Cubic Béziers',
    defaultGroup: 'cubic-bezier',
    defaultValue: [0.42, 0, 0.58, 1],
    fields: [
      { ...NUM, key: 'x1', label: 'x1', placeholder: '0.42' },
      { ...NUM, key: 'y1', label: 'y1', placeholder: '0' },
      { ...NUM, key: 'x2', label: 'x2', placeholder: '0.58' },
      { ...NUM, key: 'y2', label: 'y2', placeholder: '1' },
    ],
    toForm: (value) => {
      if (!Array.isArray(value) || value.length !== 4) return null;
      const [x1, y1, x2, y2] = value;
      if (![x1, y1, x2, y2].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
      return { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) };
    },
    fromForm: (form) =>
      [formString(form, 'x1'), formString(form, 'y1'), formString(form, 'x2'), formString(form, 'y2')].map((n) =>
        Number(n),
      ),
  },
  {
    type: 'shadow',
    label: 'Shadows',
    defaultGroup: 'shadow',
    defaultValue: {
      color: '#00000040',
      offsetX: '0px',
      offsetY: '2px',
      blur: '4px',
      spread: '0px',
      type: 'dropShadow',
    },
    fields: [
      { ...COLOR_FIELD, key: 'color', label: 'Color', full: true },
      { ...NUM, key: 'offsetX', label: 'Offset X', placeholder: '0', unit: 'px' },
      { ...NUM, key: 'offsetY', label: 'Offset Y', placeholder: '2', unit: 'px' },
      { ...NUM, key: 'blur', label: 'Blur', placeholder: '4', unit: 'px' },
      { ...NUM, key: 'spread', label: 'Spread', placeholder: '0', unit: 'px' },
      { kind: 'checkbox', key: 'inset', label: 'Inner shadow' },
    ],
    toForm: (value) => {
      if (!isRecord(value)) return null;
      const offsetX = splitNumUnit(value['offsetX']) ?? { n: '0', unit: 'px' };
      const offsetY = splitNumUnit(value['offsetY']) ?? { n: '0', unit: 'px' };
      const blur = splitNumUnit(value['blur']) ?? { n: '0', unit: 'px' };
      const spread = splitNumUnit(value['spread']) ?? { n: '0', unit: 'px' };
      const color = typeof value['color'] === 'string' ? value['color'] : '';
      return {
        color,
        offsetX: offsetX.n,
        offsetY: offsetY.n,
        blur: blur.n,
        spread: spread.n,
        inset: value['type'] === 'inner',
      };
    },
    fromForm: (form) => ({
      color: formString(form, 'color'),
      offsetX: joinNumUnit(formString(form, 'offsetX'), 'px'),
      offsetY: joinNumUnit(formString(form, 'offsetY'), 'px'),
      blur: joinNumUnit(formString(form, 'blur'), 'px'),
      spread: joinNumUnit(formString(form, 'spread'), 'px'),
      type: formBoolean(form, 'inset') ? 'inner' : 'dropShadow',
    }),
  },
  {
    type: 'border',
    label: 'Borders',
    defaultGroup: 'border',
    defaultValue: { color: '#000000', width: '1px', style: 'solid' },
    fields: [
      { ...NUM, key: 'widthN', label: 'Width', placeholder: '1', unit: 'px' },
      {
        kind: 'select',
        key: 'style',
        label: 'Style',
        options: ['solid', 'dashed', 'dotted', 'double', 'none'],
      },
      { ...COLOR_FIELD, key: 'color', label: 'Color' },
    ],
    toForm: (value) => {
      if (!isRecord(value)) return null;
      const width = splitNumUnit(value['width']) ?? { n: '1', unit: 'px' };
      const style = typeof value['style'] === 'string' ? value['style'] : 'solid';
      const color = typeof value['color'] === 'string' ? value['color'] : '';
      return { widthN: width.n, style, color };
    },
    fromForm: (form) => ({
      color: formString(form, 'color'),
      width: joinNumUnit(formString(form, 'widthN'), 'px'),
      style: formString(form, 'style') || 'solid',
    }),
  },
  {
    type: 'transition',
    label: 'Transitions',
    defaultGroup: 'transition',
    defaultValue: { duration: '200ms', delay: '0ms', timingFunction: 'ease' },
    fields: [
      { ...NUM, key: 'durationN', label: 'Duration', placeholder: '200', unit: 'ms' },
      { ...NUM, key: 'delayN', label: 'Delay', placeholder: '0', unit: 'ms' },
      { kind: 'text', key: 'timingFunction', label: 'Timing function', placeholder: 'ease', full: true },
    ],
    toForm: (value) => {
      if (!isRecord(value)) return null;
      const duration = splitNumUnit(value['duration']) ?? { n: '200', unit: 'ms' };
      const delay = splitNumUnit(value['delay']) ?? { n: '0', unit: 'ms' };
      const timingFunction = typeof value['timingFunction'] === 'string' ? value['timingFunction'] : 'ease';
      return { durationN: duration.n, delayN: delay.n, timingFunction };
    },
    fromForm: (form) => ({
      duration: joinNumUnit(formString(form, 'durationN'), 'ms'),
      delay: joinNumUnit(formString(form, 'delayN'), 'ms'),
      timingFunction: formString(form, 'timingFunction') || 'ease',
    }),
  },
];

const SPEC_BY_TYPE: ReadonlyMap<TokenType, TypeSpec> = new Map(TYPE_SPECS.map((spec) => [spec.type, spec] as const));

/** Look up the editor spec for a token type. */
export const getTypeSpec = (type: TokenType): TypeSpec => {
  const spec = SPEC_BY_TYPE.get(type);
  if (spec === undefined) {
    throw new Error(`No editor spec for token type "${type}".`);
  }
  return spec;
};

/** Convert a raw `$value` into a structured form; `null` → raw editor. */
export const valueToForm = (spec: TypeSpec, value: unknown): TokenForm | null => spec.toForm(value);

/** Convert a structured form back into a raw `$value`. */
export const formToValue = (spec: TypeSpec, form: TokenForm): unknown => spec.fromForm(form);
