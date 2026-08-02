import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildOutputSchema,
  buildOutputSchemas,
  generateOutputSchemas,
  toCssVariable,
  type OutputSchema,
} from './output.js';
import { resolveDocument } from '../core/resolver.js';
import { parseTokenDocument } from '../core/parser.js';
import { transformTokens } from '../core/transformer.js';
import { GeneratorError } from '../utils/errors.js';
import { ALL_FORMATS, type ResolvedToken } from '../core/types.js';

const SAMPLE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
    secondary: { $value: '{color.primary}' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
    large: { $value: '24px' },
  },
  typography: {
    heading: {
      $type: 'typography',
      h1: {
        $value: { fontFamily: 'Inter, sans-serif', fontSize: '32px', fontWeight: '700', lineHeight: '1.2' },
        $description: 'Main heading style',
      },
    },
  },
  shadow: {
    $type: 'shadow',
    sm: { $value: { x: 0, y: 2, blur: 4, color: '#00000033' } },
  },
  num: {
    $type: 'number',
    opacity: { $value: 0.5 },
  },
};

const resolveSample = (): readonly ResolvedToken[] => resolveDocument(parseTokenDocument(SAMPLE));

const schemaFor = (format: (typeof ALL_FORMATS)[number]): OutputSchema => {
  const tokens = resolveSample();
  return buildOutputSchema(format, transformTokens(tokens, format));
};

const props = (schema: OutputSchema): Record<string, unknown> => schema['properties'] as Record<string, unknown>;

describe('output schema — envelope', () => {
  it('emits a draft-07 envelope with stable metadata', () => {
    const schema = schemaFor('css');
    expect(schema['$schema']).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema['$id']).toBe('https://toki.design/schema/output/css.json');
    expect(schema['title']).toBe('Toki CSS output schema');
    expect(schema['type']).toBe('object');
    expect(schema['additionalProperties']).toBe(false);
  });

  it('requires exactly the listed properties, sorted', () => {
    const schema = schemaFor('js');
    const keys = Object.keys(props(schema)).toSorted();
    expect(schema['required']).toEqual(keys);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('is deterministic across builds', () => {
    const a = JSON.stringify(schemaFor('react-native'));
    const b = JSON.stringify(schemaFor('react-native'));
    expect(a).toBe(b);
  });

  it('builds every format without throwing', () => {
    const tokens = resolveSample();
    const schemas = buildOutputSchemas(tokens, ALL_FORMATS);
    for (const format of ALL_FORMATS) {
      expect(schemas.get(format)).toBeDefined();
      expect(schemas.get(format)?.['$id']).toBe(`https://toki.design/schema/output/${format}.json`);
    }
  });
});

describe('output schema — css', () => {
  it('lists kebab-case custom properties with string values', () => {
    const schema = schemaFor('css');
    const properties = props(schema);
    expect(properties['--color-primary']).toEqual({ type: 'string', description: 'Primary brand color' });
    expect(properties['--color-secondary']).toEqual({ type: 'string' });
    expect(properties['--spacing-small']).toEqual({ type: 'string' });
  });

  it('expands composite tokens into longhand custom properties', () => {
    const schema = schemaFor('css');
    const properties = props(schema);
    expect(properties['--typography-heading-h1-font-family']).toBeDefined();
    expect(properties['--typography-heading-h1-font-size']).toBeDefined();
  });
});

describe('output schema — js family', () => {
  it('lists camelCase export names with typed values', () => {
    const schema = schemaFor('js');
    const properties = props(schema);
    expect(properties['colorPrimary']).toEqual({ type: 'string', description: 'Primary brand color' });
    expect(properties['spacingSmall']).toEqual({ type: 'string' });
    expect(properties['numOpacity']).toEqual({ type: 'number' });
  });

  it('types composite values as nested objects', () => {
    const schema = schemaFor('js');
    const shadowSm = props(schema)['shadowSm'] as Record<string, unknown>;
    expect(shadowSm['type']).toBe('object');
    expect(shadowSm['additionalProperties']).toBe(false);
    const nested = shadowSm['properties'] as Record<string, unknown>;
    expect(nested['x']).toEqual({ type: 'number' });
    expect(nested['color']).toEqual({ type: 'string' });
  });

  it('uses CONSTANT_CASE for angular formats', () => {
    for (const format of ['angular', 'angular-11'] as const) {
      const schema = schemaFor(format);
      const properties = props(schema);
      expect(properties['COLOR_PRIMARY']).toBeDefined();
      expect(properties['SPACING_SMALL']).toBeDefined();
      expect(properties['colorPrimary']).toBeUndefined();
    }
  });

  it('uses camelCase for svelte and vue ES modules', () => {
    for (const format of ['svelte', 'vue'] as const) {
      const schema = schemaFor(format);
      expect(props(schema)['colorPrimary']).toBeDefined();
    }
  });

  it('honors a naming convention override', () => {
    const tokens = resolveSample();
    const schema = buildOutputSchema('js', tokens, { naming: 'CONSTANT_CASE' });
    expect(props(schema)['COLOR_PRIMARY']).toBeDefined();
  });

  it('throws GeneratorError on identifier collisions', () => {
    const tokens = resolveDocument(
      parseTokenDocument({
        color: {
          $type: 'color',
          'primary-2': { $value: '#fff' },
          primary2: { $value: '#000' },
        },
      }),
    );
    expect(() => buildOutputSchema('js', tokens)).toThrow(GeneratorError);
  });
});

describe('output schema — grouped formats', () => {
  it('groups react-native tokens by pluralized category, with transforms applied', () => {
    const schema = schemaFor('react-native');
    const properties = props(schema);
    const colors = properties['colors'] as Record<string, unknown>;
    expect(colors['type']).toBe('object');
    const colorProps = colors['properties'] as Record<string, unknown>;
    expect(colorProps['primary']).toEqual({ type: 'string', description: 'Primary brand color' });
    const spacing = properties['spacing'] as Record<string, unknown>;
    const spacingProps = spacing['properties'] as Record<string, unknown>;
    expect(spacingProps['small']).toEqual({ type: 'number' });
    expect(spacingProps['large']).toEqual({ type: 'number' });
    const nums = properties['nums'] as Record<string, unknown>;
    const numsProps = nums['properties'] as Record<string, unknown>;
    expect(numsProps['opacity']).toEqual({ type: 'number' });
  });

  it('groups react tokens by category without platform transforms', () => {
    const schema = schemaFor('react');
    const properties = props(schema);
    const spacing = properties['spacing'] as Record<string, unknown>;
    const spacingProps = spacing['properties'] as Record<string, unknown>;
    expect(spacingProps['small']).toEqual({ type: 'string' });
  });

  it('includes the grouped tokens object for stencil with raw category keys', () => {
    const schema = schemaFor('stencil');
    const properties = props(schema);
    expect(properties['colorPrimary']).toBeDefined();
    const tokens = properties['tokens'] as Record<string, unknown>;
    expect(tokens['type']).toBe('object');
    const tokenProps = tokens['properties'] as Record<string, unknown>;
    expect(tokenProps['color']).toBeDefined();
    expect(tokenProps['spacing']).toBeDefined();
    expect(tokenProps['colors']).toBeUndefined();
  });
});

describe('output schema — tailwind', () => {
  it('maps token types to @theme namespaces', () => {
    const schema = schemaFor('tailwind');
    const properties = props(schema);
    expect(properties['--color-primary']).toEqual({ type: 'string', description: 'Primary brand color' });
    expect(properties['--spacing-small']).toEqual({ type: 'string' });
  });

  it('expands composite tokens into namespace-mapped variables', () => {
    const schema = schemaFor('tailwind');
    const properties = props(schema);
    expect(properties['--font-family-heading-h1']).toBeDefined();
    expect(properties['--font-size-heading-h1']).toBeDefined();
  });

  it('skips shadow and number tokens (no Tailwind namespace)', () => {
    const schema = schemaFor('tailwind');
    const properties = props(schema);
    expect(properties['--shadow-sm']).toBeUndefined();
    expect(properties['--num-opacity']).toBeUndefined();
  });
});

describe('toCssVariable', () => {
  it('converts a path to a --kebab-case variable', () => {
    expect(toCssVariable(['color', 'brand', 'primary'])).toBe('--color-brand-primary');
  });
});

describe('generateOutputSchemas', () => {
  it('writes one schema file per format under the output directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toki-schema-'));
    const input = await sampleFile();
    const written = await generateOutputSchemas({ input, output: dir, formats: ['css', 'js'] });
    expect(written).toEqual(['css.json', 'js.json']);
    const css = JSON.parse(await readFile(join(dir, 'css.json'), 'utf8')) as OutputSchema;
    expect(props(css)['--color-primary']).toBeDefined();
  });

  it('applies a theme suffix to schema filenames', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toki-schema-'));
    const written = await generateOutputSchemas({
      input: await sampleFile(),
      output: dir,
      formats: ['css'],
      theme: 'light',
    });
    expect(written).toEqual(['css.light.json']);
  });

  it('defaults to every format when formats are omitted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toki-schema-'));
    const written = await generateOutputSchemas({ input: await sampleFile(), output: dir });
    expect(written).toEqual(ALL_FORMATS.map((format) => `${format}.json`));
  });
});

let samplePath: string | undefined;

/** Write the sample tokens to a temp file once and return its path. */
const sampleFile = async (): Promise<string> => {
  if (samplePath === undefined) {
    samplePath = join(await mkdtemp(join(tmpdir(), 'toki-sample-')), 'tokens.json');
    await writeFile(samplePath, JSON.stringify(SAMPLE), 'utf8');
  }
  return samplePath;
};
