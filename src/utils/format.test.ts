import { describe, it, expect } from 'vitest';
import { themePath } from './format.js';

describe('themePath', () => {
  it('inserts theme suffix before the extension', () => {
    expect(themePath('css/tokens.css', 'light')).toBe('css/tokens.light.css');
  });

  it('handles double extensions like .d.ts', () => {
    expect(themePath('js/tokens.d.ts', 'dark')).toBe('js/tokens.dark.d.ts');
  });

  it('does not theme README files', () => {
    expect(themePath('css/README.md', 'light')).toBe('css/README.md');
  });

  it('handles files without extensions', () => {
    expect(themePath('angular/tokens', 'light')).toBe('angular/tokens.light');
  });

  it('handles top-level files (no directory)', () => {
    expect(themePath('tokens.css', 'dark')).toBe('tokens.dark.css');
  });
});
