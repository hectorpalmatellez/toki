import { describe, it, expect } from 'vitest';

describe('tui module', () => {
  it('exports runTui function', async () => {
    const mod = await import('./tui.js');
    expect(typeof mod.runTui).toBe('function');
  });
});
