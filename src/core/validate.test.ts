import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import { validateTokens, formatValidateTerminal } from './validate.js';

const tmp = (name: string): string => join(tmpdir(), `toki-validate-test-${name}.json`);

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

describe('validateTokens', () => {
  const cleanup: string[] = [];

  const makeTmp = async (name: string, data: unknown): Promise<string> => {
    const filePath = tmp(name);
    cleanup.push(filePath);
    await writeJson(filePath, data);
    return filePath;
  };

  const cleanupAll = async (): Promise<void> => {
    for (const f of cleanup) {
      await rm(f, { force: true });
    }
    cleanup.length = 0;
  };

  it('returns valid: true for a clean token file with descriptions', async () => {
    const path = await makeTmp('valid', {
      color: {
        $type: 'color',
        primary: { $value: '#1a73e8', $description: 'Primary brand color' },
        secondary: { $value: '#5f6368', $description: 'Secondary text color' },
      },
    });
    const report = await validateTokens(path);
    expect(report.valid).toBe(true);
    expect(report.tokenCount).toBe(2);
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    await cleanupAll();
  });

  it('reports missing descriptions as warnings', async () => {
    const path = await makeTmp('no-desc', {
      color: { $type: 'color', primary: { $value: '#1a73e8' } },
    });
    const report = await validateTokens(path);
    expect(report.valid).toBe(true);
    const warnings = report.issues.filter((i) => i.severity === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.code === 'MISSING_DESCRIPTION')).toBe(true);
    await cleanupAll();
  });

  it('reports naming convention violations as warnings', async () => {
    const path = await makeTmp('naming', {
      color: {
        $type: 'color',
        Primary: { $value: '#1a73e8', $description: 'Primary' },
      },
    });
    const report = await validateTokens(path);
    expect(report.valid).toBe(true);
    const warnings = report.issues.filter((i) => i.severity === 'warning');
    expect(warnings.some((w) => w.code === 'NAMING_CONVENTION')).toBe(true);
    await cleanupAll();
  });

  it('reports duplicate values as warnings', async () => {
    const path = await makeTmp('dup', {
      color: {
        $type: 'color',
        a: { $value: '#1a73e8', $description: 'A' },
        b: { $value: '#1a73e8', $description: 'B' },
      },
    });
    const report = await validateTokens(path);
    expect(report.valid).toBe(true);
    const warnings = report.issues.filter((i) => i.severity === 'warning');
    expect(warnings.some((w) => w.code === 'DUPLICATE_VALUE')).toBe(true);
    await cleanupAll();
  });

  it('reports structural errors (invalid JSON)', async () => {
    const badPath = tmp('bad-json');
    cleanup.push(badPath);
    await writeFile(badPath, 'not json!!!', 'utf8');
    const report = await validateTokens(badPath);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.severity === 'error')).toBe(true);
    await cleanupAll();
  });

  it('reports broken references as errors', async () => {
    const path = await makeTmp('broken-ref', {
      color: {
        $type: 'color',
        alias: { $value: '{color.unknown}', $description: 'Broken ref' },
      },
    });
    const report = await validateTokens(path);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.severity === 'error')).toBe(true);
    await cleanupAll();
  });

  it('reports circular references as errors', async () => {
    const path = await makeTmp('circular', {
      color: {
        $type: 'color',
        a: { $value: '{color.b}', $description: 'A' },
        b: { $value: '{color.a}', $description: 'B' },
      },
    });
    const report = await validateTokens(path);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.severity === 'error')).toBe(true);
    await cleanupAll();
  });

  it('produces a correct type summary', async () => {
    const path = await makeTmp('type-summary', {
      color: {
        $type: 'color',
        primary: { $value: '#1a73e8', $description: 'Primary' },
        secondary: { $value: '#5f6368', $description: 'Secondary' },
      },
      spacing: {
        $type: 'dimension',
        small: { $value: '8px', $description: 'Small spacing' },
      },
    });
    const report = await validateTokens(path);
    expect(report.typeSummary['color']).toBe(2);
    expect(report.typeSummary['dimension']).toBe(1);
    await cleanupAll();
  });

  it('reports elapsed time as a non-negative integer', async () => {
    const path = await makeTmp('elapsed', {
      color: { $type: 'color', a: { $value: '#fff', $description: 'A' } },
    });
    const report = await validateTokens(path);
    expect(report.elapsed).toBeGreaterThanOrEqual(0);
    await cleanupAll();
  });
});

describe('formatValidateTerminal', () => {
  it('shows valid status with checkmark', () => {
    const output = formatValidateTerminal({
      valid: true,
      tokenCount: 5,
      typeSummary: { color: 3, dimension: 2 },
      issues: [],
      elapsed: 3,
    });
    expect(output).toContain('✓');
    expect(output).toContain('5');
    expect(output).toContain('3ms');
  });

  it('shows invalid status with cross', () => {
    const output = formatValidateTerminal({
      valid: false,
      tokenCount: 0,
      typeSummary: {},
      issues: [{ severity: 'error', code: 'PARSE_ERROR', message: 'bad' }],
      elapsed: 1,
    });
    expect(output).toContain('✗');
  });

  it('includes the file path when provided', () => {
    const output = formatValidateTerminal(
      { valid: true, tokenCount: 1, typeSummary: { color: 1 }, issues: [], elapsed: 1 },
      'tokens.json',
    );
    expect(output).toContain('tokens.json');
  });
});
