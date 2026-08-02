// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexHtml = readFileSync(resolve('src/ui/public/index.html'), 'utf8');

const bodyHtml = indexHtml
  .replace(/[\s\S]*<body[^>]*>/, '')
  .replace(/<script[\s\S]*<\/script>/, '')
  .replace('</body>', '')
  .replace('</html>', '');

const SAMPLE = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary brand color' },
  },
  spacing: {
    $type: 'dimension',
    small: { $value: '8px' },
  },
};

const RICH = {
  color: {
    $type: 'color',
    primary: { $value: '#1a73e8', $description: 'Primary' },
    alias: { $value: '{color.primary}' },
  },
  spacing: { $type: 'dimension', small: { $value: '8px' } },
  border: { $type: 'border', card: { $value: { color: '#000000', width: '1px', style: 'solid' } } },
  shadow: {
    $type: 'shadow',
    card: {
      $value: { color: '#000000', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '0px', type: 'dropShadow' },
    },
  },
  transition: { $type: 'transition', hover: { $value: { duration: '200ms', delay: '0ms', timingFunction: 'ease' } } },
};

const BUILD = {
  output: './dist',
  formats: ['css'],
  tokenCount: 1,
  artifacts: [{ relativePath: 'css/tokens.css', format: 'css', content: '--color-primary: #1a73e8;' }],
};

interface Route {
  readonly status?: number;
  readonly body?: unknown;
  readonly raw?: string;
}

type RouteHandler = (init?: RequestInit) => Route | Promise<Route>;
type Routes = Partial<Record<string, RouteHandler>>;

const route = (status: number, body: unknown): Route => ({ status, body });

const defaultRoute = (path: string): Route => {
  if (path === '/api/state') {
    return route(200, {
      cwd: '/tmp/fake-project',
      hasTokens: false,
      hasConfig: false,
      formats: ['css', 'js'],
      prefs: {},
      configFormats: null,
      configOutput: null,
    });
  }
  if (path === '/api/tokens') {
    return route(200, { path: '/tmp/fake-project/tokens.json', exists: false, tokens: null, sample: SAMPLE });
  }
  if (path === '/api/validate') {
    return route(200, { issues: [] });
  }
  throw new Error(`Unexpected fetch: ${path}`);
};

let fetchCalls: Array<{ path: string; init?: RequestInit }> = [];

const mountApp = async (routes?: Routes): Promise<void> => {
  fetchCalls = [];
  document.body.innerHTML = bodyHtml;
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    fetchCalls.push({ path, init });
    const handler = routes?.[path];
    const result = handler !== undefined ? await handler(init) : defaultRoute(path);
    const status = result.status ?? 200;
    if (result.raw !== undefined) {
      return {
        ok: status < 400,
        status,
        json: async () => Promise.reject(new Error('not json')),
      } as unknown as Response;
    }
    return { ok: status < 400, status, json: async () => result.body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  await import('../app.js');
  await new Promise((r) => setTimeout(r, 0));
};

const flush = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
};

const click = (id: string): void => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing #${id}`);
  (node as HTMLElement).click();
};

const group = (label: string): HTMLElement => {
  const node = [...document.querySelectorAll('section.group')].find(
    (section) => section.querySelector('h2')?.textContent === label,
  );
  if (node === undefined) throw new Error(`no group "${label}"`);
  return node as HTMLElement;
};

const field = (label: string, fk: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
  const node = group(label).querySelector(`[data-fk="${fk}"]`);
  if (node === null) throw new Error(`no field "${fk}" in ${label}`);
  return node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
};

const putBody = (): Record<string, unknown> => {
  const put = fetchCalls.find((c) => c.path === '/api/tokens' && c.init?.method === 'PUT');
  if (put === undefined || typeof put.init?.body !== 'string') throw new Error('no PUT to /api/tokens');
  return JSON.parse(put.init.body) as Record<string, unknown>;
};

const toast = (): HTMLElement => document.getElementById('toast') as HTMLElement;

const statusEl = (): HTMLElement => document.getElementById('status') as HTMLElement;

const mountRich = async (extra?: Routes): Promise<void> => {
  await mountApp({
    '/api/tokens': () => route(200, { path: 'tokens.json', exists: true, tokens: RICH }),
    ...extra,
  });
};

describe('ui app boot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders the working directory and does not crash on missing elements', async () => {
    await mountApp();
    expect(document.getElementById('cwd')?.textContent).toBe('/tmp/fake-project');
    expect(statusEl().className).toContain('hidden');
    expect(document.getElementById('formats')?.children.length).toBe(2);
    expect(document.getElementById('editor')?.children.length).toBeGreaterThan(0);
  });

  it('renders singular "Add" buttons for each group', async () => {
    await mountApp();
    const groups = [...document.querySelectorAll('section.group')];
    const labels = groups.map((g) => g.querySelector('button.add-btn')?.textContent);
    expect(labels).toContain('Add font family');
    expect(labels).toContain('Add color');
    expect(labels).toContain('Add shadow');
    expect(labels.some((l) => l === 'Add font familie')).toBe(false);
  });

  it('surfaces token read errors through the status bar', async () => {
    await mountApp({
      '/api/tokens': () =>
        route(200, {
          path: '/tmp/fake-project/tokens.json',
          exists: true,
          tokens: null,
          sample: null,
          error: 'Broken reference',
        }),
    });
    expect(statusEl().className).toContain('error');
    expect(statusEl().textContent).toContain('Broken reference');
  });

  it('reports state load failures in the status bar', async () => {
    await mountApp({ '/api/state': () => route(500, { error: 'state boom' }) });
    expect(statusEl().className).toContain('error');
    expect(statusEl().textContent).toContain('state boom');
  });

  it('applies saved preferences for formats and output', async () => {
    await mountApp({
      '/api/state': () =>
        route(200, {
          cwd: '/cwd',
          hasTokens: false,
          hasConfig: true,
          formats: ['css', 'js', 'tailwind'],
          prefs: { formats: ['tailwind'], output: './out' },
          configFormats: null,
          configOutput: null,
        }),
    });
    const checked = [...document.querySelectorAll<HTMLInputElement>('#formats input')]
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    expect(checked).toEqual(['tailwind']);
    expect((document.getElementById('output') as HTMLInputElement).value).toBe('./out');
  });

  it('runs validation on boot when tokens exist', async () => {
    await mountApp({
      '/api/tokens': () => route(200, { path: 'tokens.json', exists: true, tokens: SAMPLE }),
      '/api/validate': () =>
        route(200, { issues: [{ severity: 'error', code: 'E1', message: 'Bad token', tokenId: 'color.primary' }] }),
    });
    expect(fetchCalls.some((c) => c.path === '/api/validate')).toBe(true);
    const panel = document.getElementById('validation') as HTMLElement;
    expect(panel.className).toContain('error');
    expect(panel.textContent).toContain('1 issue after validation');
    expect(panel.textContent).toContain('E1');
    expect(panel.textContent).toContain('color.primary: Bad token');
  });

  it('hides the validation panel when validation reports no issues', async () => {
    await mountApp({
      '/api/tokens': () => route(200, { path: 'tokens.json', exists: true, tokens: SAMPLE }),
      '/api/validate': () => route(200, { issues: [] }),
    });
    expect((document.getElementById('validation') as HTMLElement).className).toContain('hidden');
  });

  it('tolerates validation request failures', async () => {
    await mountApp({
      '/api/tokens': () => route(200, { path: 'tokens.json', exists: true, tokens: SAMPLE }),
      '/api/validate': () => route(500, { error: 'nope' }),
    });
    expect((document.getElementById('validation') as HTMLElement).className).toContain('hidden');
  });
});

describe('ui app editor interactions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('adds tokens and suffixes duplicate names', async () => {
    await mountRich();
    const button = group('Colors').querySelector('button.add-btn') as HTMLButtonElement;
    button.click();
    button.click();
    const names = [...group('Colors').querySelectorAll<HTMLInputElement>('.token-name')].map((n) => n.value);
    expect(names).toEqual(['primary', 'alias', 'new-token', 'new-token-2']);
  });

  it('removes tokens on ✕', async () => {
    await mountRich();
    const rows = () => group('Colors').querySelectorAll('.token-row').length;
    expect(rows()).toBe(2);
    (group('Colors').querySelector('.btn-danger') as HTMLButtonElement).click();
    expect(rows()).toBe(1);
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    expect(Object.keys(tree['color'] as Record<string, unknown>)).toEqual(['alias']);
  });

  it('renames tokens and edits descriptions', async () => {
    await mountRich();
    const name = group('Colors').querySelector<HTMLInputElement>('.token-name');
    (name as HTMLInputElement).value = 'brand';
    name?.dispatchEvent(new Event('input'));
    const desc = group('Colors').querySelector<HTMLInputElement>('.token-desc');
    (desc as HTMLInputElement).value = 'Renamed';
    desc?.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const primary = (tree['color'] as Record<string, Record<string, unknown>>)['brand'];
    expect(primary?.['$description']).toBe('Renamed');
  });

  it('shows a group badge for non-default groups', async () => {
    await mountApp({
      '/api/tokens': () =>
        route(200, {
          path: 'tokens.json',
          exists: true,
          tokens: { brand: { color: { accent: { $value: '#000000' } } } },
        }),
    });
    expect(group('Colors').textContent).toContain('[brand]');
  });

  it('edits raw reference values through the textarea', async () => {
    await mountRich();
    const area = field('Colors', 'raw');
    expect(area.tagName).toBe('TEXTAREA');
    area.value = '{color.primary}';
    area.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const alias = (tree['color'] as Record<string, Record<string, unknown>>)['alias'];
    expect(alias?.['$value']).toBe('{color.primary}');
  });

  it('syncs the color text input from the picker', async () => {
    await mountRich();
    const picker = group('Colors').querySelector<HTMLInputElement>('input[type="color"]');
    picker?.click();
    (picker as HTMLInputElement).value = '#ff0000';
    picker?.dispatchEvent(new Event('input'));
    const text = field('Colors', 'color');
    expect(text.value).toBe('#ff0000');
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const primary = (tree['color'] as Record<string, Record<string, unknown>>)['primary'];
    expect(primary?.['$value']).toBe('#ff0000');
  });

  it('syncs the picker from a valid hex text input', async () => {
    await mountRich();
    const text = field('Colors', 'color');
    text.value = '#00ff00';
    text.dispatchEvent(new Event('input'));
    const picker = group('Colors').querySelector<HTMLInputElement>('input[type="color"]');
    expect(picker?.value).toBe('#00ff00');
  });

  it('edits number and unit fields for dimensions', async () => {
    await mountRich();
    const n = field('Spacing & Sizes', 'n') as HTMLInputElement;
    n.value = '12';
    n.dispatchEvent(new Event('input'));
    const unit = field('Spacing & Sizes', 'unit') as HTMLSelectElement;
    unit.value = 'rem';
    unit.dispatchEvent(new Event('change'));
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const small = (tree['spacing'] as Record<string, Record<string, unknown>>)['small'];
    expect(small?.['$value']).toBe('12rem');
  });

  it('edits select fields for borders', async () => {
    await mountRich();
    const style = field('Borders', 'style') as HTMLSelectElement;
    style.value = 'dashed';
    style.dispatchEvent(new Event('change'));
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const card = (tree['border'] as Record<string, Record<string, unknown>>)['card'];
    expect((card?.['$value'] as Record<string, unknown>)['style']).toBe('dashed');
  });

  it('edits checkbox fields for shadows', async () => {
    await mountRich();
    const inset = field('Shadows', 'inset') as HTMLInputElement;
    inset.click();
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const card = (tree['shadow'] as Record<string, Record<string, unknown>>)['card'];
    expect((card?.['$value'] as Record<string, unknown>)['type']).toBe('inner');
  });

  it('edits text fields for transitions', async () => {
    await mountRich();
    const fn = field('Transitions', 'timingFunction') as HTMLInputElement;
    fn.value = 'linear';
    fn.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    const tree = putBody()['tokens'] as Record<string, unknown>;
    const hover = (tree['transition'] as Record<string, Record<string, unknown>>)['hover'];
    expect((hover?.['$value'] as Record<string, unknown>)['timingFunction']).toBe('linear');
  });

  it('renders the build results and toggles artifact expansion', async () => {
    await mountApp({
      '/api/tokens': () => route(200, { path: 'tokens.json', exists: true, tokens: SAMPLE }),
      '/api/build': () => route(200, { ok: true, build: BUILD }),
    });
    click('btn-build');
    await flush();
    const results = document.getElementById('results') as HTMLElement;
    expect(results.className).toContain('results');
    expect(results.className).not.toContain('hidden');
    expect(results.textContent).toContain('Generated files');
    expect(results.textContent).toContain('1 token · 1 format → ./dist');
    expect(results.textContent).toContain('css/tokens.css');

    (results.querySelector('.artifact-row') as HTMLElement).click();
    expect(results.querySelector('.artifact pre')).not.toBeNull();
    (results.querySelector('.artifact-row') as HTMLElement).click();
    expect(results.querySelector('.artifact pre')).toBeNull();
    expect(toast().textContent).toContain('Built 1 artifact');
  });

  it('hides the results panel when the build response is empty', async () => {
    await mountApp({
      '/api/tokens': () => route(200, { path: 'tokens.json', exists: true, tokens: SAMPLE }),
      '/api/build': () => route(200, { ok: false, error: 'no build' }),
    });
    click('btn-build');
    await flush();
    expect((document.getElementById('results') as HTMLElement).className).toContain('hidden');
    expect(toast().textContent).toContain('no build');
  });
});

describe('ui app save & validation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  const saveRoutes = (): Routes => ({
    '/api/tokens': (init) =>
      init?.method === 'PUT'
        ? route(200, { ok: true, issues: [], build: BUILD })
        : route(200, { path: 'tokens.json', exists: false, tokens: null, sample: SAMPLE }),
  });

  it('saves, hides status, and shows the success toast', async () => {
    await mountApp(saveRoutes());
    click('btn-save');
    await flush();
    expect(putBody()['output']).toBe('./dist');
    expect(statusEl().className).toContain('hidden');
    expect(toast().textContent).toContain('Saved and built 1 artifact');
    expect((document.getElementById('results') as HTMLElement).textContent).toContain('css/tokens.css');
    expect((document.getElementById('validation') as HTMLElement).className).toContain('hidden');
  });

  it('auto-hides the toast after 3.5 seconds', async () => {
    await mountApp(saveRoutes());
    vi.useFakeTimers();
    try {
      click('btn-save');
      await vi.advanceTimersByTimeAsync(0);
      expect(toast().classList.contains('hidden')).toBe(false);
      await vi.advanceTimersByTimeAsync(4000);
      expect(toast().classList.contains('hidden')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks saving when a token has no name', async () => {
    await mountApp(saveRoutes());
    click('btn-save');
    await flush();
    expect(putBody()['output']).toBe('./dist');
    const name = group('Colors').querySelector<HTMLInputElement>('.token-name');
    (name as HTMLInputElement).value = '';
    name?.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    expect(toast().className).toContain('error');
    expect(toast().textContent).toContain('missing a name');
    expect(fetchCalls.filter((c) => c.path === '/api/tokens' && c.init?.method === 'PUT')).toHaveLength(1);
  });

  it('rejects names starting with $', async () => {
    await mountApp(saveRoutes());
    const name = group('Colors').querySelector<HTMLInputElement>('.token-name');
    (name as HTMLInputElement).value = '$bad';
    name?.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('must not start with "$"');
  });

  it('rejects names containing spaces', async () => {
    await mountApp(saveRoutes());
    const name = group('Colors').querySelector<HTMLInputElement>('.token-name');
    (name as HTMLInputElement).value = 'bad name';
    name?.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('contains a space');
  });

  it('rejects duplicate token names', async () => {
    await mountApp(saveRoutes());
    (group('Colors').querySelector('button.add-btn') as HTMLButtonElement).click();
    const names = group('Colors').querySelectorAll<HTMLInputElement>('.token-name');
    (names[1] as HTMLInputElement).value = 'primary';
    names[1]?.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('Duplicate token name');
  });

  it('rejects empty token values', async () => {
    await mountApp(saveRoutes());
    const text = field('Colors', 'color');
    text.value = '';
    text.dispatchEvent(new Event('input'));
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('empty value');
  });

  it('shows server-side save errors in the toast', async () => {
    await mountApp({
      '/api/tokens': () => route(200, { ok: false, error: 'disk full' }),
    });
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('disk full');
  });

  it('shows network errors during save in the toast', async () => {
    await mountApp({
      '/api/tokens': () => {
        throw new Error('connection reset');
      },
    });
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('connection reset');
  });

  it('shows a generic message when a non-JSON error response is returned', async () => {
    await mountApp({
      '/api/tokens': () => ({ status: 500, raw: 'boom' }),
    });
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('Request failed (500)');
  });

  it('rejects invalid bodies with a generic request-failed message', async () => {
    await mountApp({
      '/api/tokens': () => ({ status: 500, body: 'plain text' }),
    });
    click('btn-save');
    await flush();
    expect(toast().textContent).toContain('Request failed (500)');
  });

  it('applies the output directory change', async () => {
    await mountApp(saveRoutes());
    const output = document.getElementById('output') as HTMLInputElement;
    output.value = './custom-out';
    output.dispatchEvent(new Event('change'));
    click('btn-save');
    await flush();
    expect(putBody()['output']).toBe('./custom-out');
  });

  it('respects the busy guard while a save is in flight', async () => {
    let resolvePut: (value: unknown) => void = () => undefined;
    await mountApp({
      '/api/tokens': (init) =>
        init?.method === 'PUT'
          ? new Promise((resolveRequest) => {
              resolvePut = resolveRequest;
            })
          : route(200, { path: 'tokens.json', exists: false, tokens: null, sample: SAMPLE }),
    });
    click('btn-save');
    await flush();
    expect((document.getElementById('btn-save') as HTMLButtonElement).disabled).toBe(true);
    resolvePut(route(200, { ok: true, issues: [], build: BUILD }));
    await flush();
    expect((document.getElementById('btn-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('toggles format checkboxes into the save payload', async () => {
    await mountApp(saveRoutes());
    const css = [...document.querySelectorAll<HTMLInputElement>('#formats input')].find((cb) => cb.value === 'css');
    (css as HTMLInputElement).click();
    click('btn-save');
    await flush();
    expect(putBody()['formats']).toEqual(['js']);
  });
});

describe('ui app reset', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('does nothing when the user cancels the confirmation', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    await mountApp();
    click('btn-reset');
    await flush();
    expect(fetchCalls.some((c) => c.path === '/api/reset')).toBe(false);
  });

  it('replaces the editor with sample tokens after confirmation', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    await mountApp({
      '/api/reset': () => route(200, { ok: true, tokens: SAMPLE, issues: [], build: BUILD }),
    });
    click('btn-reset');
    await flush();
    expect(fetchCalls.some((c) => c.path === '/api/reset')).toBe(true);
    expect(group('Colors').querySelector<HTMLInputElement>('.token-name')?.value).toBe('primary');
    expect(toast().textContent).toContain('Reset to sample tokens');
    expect((document.getElementById('results') as HTMLElement).textContent).toContain('css/tokens.css');
  });

  it('shows reset failures in the toast', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    await mountApp({
      '/api/reset': () => route(200, { ok: false, error: 'read-only' }),
    });
    click('btn-reset');
    await flush();
    expect(toast().textContent).toContain('read-only');
  });
});
