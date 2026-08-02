// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexHtml = readFileSync(resolve('src/ui/public/index.html'), 'utf8');

const bodyHtml = indexHtml.replace(/[\s\S]*<body[^>]*>/, '').replace(/<script[\s\S]*<\/script>/, '').replace('</body>', '').replace('</html>', '');

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

const json = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const mountApp = async (): Promise<void> => {
  document.body.innerHTML = bodyHtml;
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/state') {
      return Promise.resolve(
        json({ cwd: '/tmp/fake-project', formats: ['css', 'js'], prefs: {}, configFormats: null, configOutput: null }),
      );
    }
    if (path === '/api/tokens') {
      return Promise.resolve(json({ path: '/tmp/fake-project/tokens.json', exists: false, tokens: null, sample: SAMPLE }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  await import('../app.js');
  await new Promise((r) => setTimeout(r, 0));
  vi.unstubAllGlobals();
};

describe('ui app boot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('renders the working directory and does not crash on missing elements', async () => {
    await mountApp();
    expect(document.getElementById('cwd')?.textContent).toBe('/tmp/fake-project');
    expect(document.getElementById('status')?.className).toContain('hidden');
    expect(document.getElementById('formats')?.children.length).toBe(2);
    expect(document.getElementById('editor')?.children.length).toBeGreaterThan(0);
  });

  it('surfaces token read errors through the status bar', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/state') {
        return Promise.resolve(
          json({ cwd: '/tmp/fake-project', formats: ['css'], prefs: {}, configFormats: null, configOutput: null }),
        );
      }
      if (path === '/api/tokens') {
        return Promise.resolve(
          json({ path: '/tmp/fake-project/tokens.json', exists: true, tokens: null, sample: null, error: 'Broken reference' }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = bodyHtml;
    vi.resetModules();
    await import('../app.js');
    await new Promise((r) => setTimeout(r, 0));
    vi.unstubAllGlobals();
    expect(document.getElementById('status')?.className).toContain('error');
    expect(document.getElementById('status')?.textContent).toContain('Broken reference');
  });
});
