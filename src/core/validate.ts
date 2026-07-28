import type { ResolvedToken, TokenValue } from './types.js';
import { readTokenFile, parseTokenDocument } from './parser.js';
import { resolveDocument } from './resolver.js';
import type { DesignTokenDocument } from './types.js';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly tokenId?: string;
}

export interface ValidationReport {
  readonly valid: boolean;
  readonly tokenCount: number;
  readonly typeSummary: Readonly<Record<string, number>>;
  readonly issues: readonly ValidationIssue[];
  readonly elapsed: number;
}

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const displayValue = (value: TokenValue): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

export const validateTokens = async (input: string): Promise<ValidationReport> => {
  const start = performance.now();
  const issues: ValidationIssue[] = [];

  let doc: DesignTokenDocument;
  try {
    const raw = await readTokenFile(input);
    doc = parseTokenDocument(raw, input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'PARSE_ERROR';
    issues.push({ severity: 'error', code, message: msg });
    return { valid: false, tokenCount: 0, typeSummary: {}, issues, elapsed: Math.round(performance.now() - start) };
  }

  let tokens: readonly ResolvedToken[];
  try {
    tokens = resolveDocument(doc);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'RESOLVE_ERROR';
    issues.push({ severity: 'error', code, message: msg });
    return { valid: false, tokenCount: 0, typeSummary: {}, issues, elapsed: Math.round(performance.now() - start) };
  }

  for (const token of tokens) {
    if (token.description === undefined || token.description === '') {
      issues.push({
        severity: 'warning',
        code: 'MISSING_DESCRIPTION',
        message: `Token "${token.id}" has no $description.`,
        tokenId: token.id,
      });
    }
  }

  for (const token of tokens) {
    for (const segment of token.path) {
      if (!KEBAB_RE.test(segment)) {
        issues.push({
          severity: 'warning',
          code: 'NAMING_CONVENTION',
          message: `Token "${token.id}" has path segment "${segment}" that is not kebab-case.`,
          tokenId: token.id,
        });
        break;
      }
    }
  }

  const valueMap = new Map<string, { ids: string[]; raw: TokenValue }>();
  for (const token of tokens) {
    const key = typeof token.value === 'string' ? token.value : JSON.stringify(token.value);
    const existing = valueMap.get(key);
    if (existing !== undefined) {
      valueMap.set(key, { ids: [...existing.ids, token.id], raw: existing.raw });
    } else {
      valueMap.set(key, { ids: [token.id], raw: token.value });
    }
  }
  for (const [, { ids, raw }] of valueMap) {
    if (ids.length > 1) {
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_VALUE',
        message: `Tokens ${ids.map((id) => `"${id}"`).join(', ')} share the same value (${displayValue(raw)}). Consider using a reference.`,
        ...(ids[0] !== undefined ? { tokenId: ids[0] } : {}),
      });
    }
  }

  const typeSummary: Record<string, number> = {};
  for (const token of tokens) {
    typeSummary[token.type] = (typeSummary[token.type] ?? 0) + 1;
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    valid: !hasErrors,
    tokenCount: tokens.length,
    typeSummary,
    issues,
    elapsed: Math.round(performance.now() - start),
  };
};

export const formatValidateTerminal = (report: ValidationReport, filePath?: string): string => {
  const lines: string[] = [];
  if (filePath !== undefined) {
    lines.push(`  Token file:    ${filePath}`);
  }
  lines.push(`  Valid:         ${report.valid ? '✓' : '✗'}`);
  lines.push(`  Token count:   ${report.tokenCount}`);
  lines.push(`  Elapsed:       ${report.elapsed}ms`);

  const types = Object.entries(report.typeSummary).toSorted(([a], [b]) => a.localeCompare(b));
  if (types.length > 0) {
    lines.push('');
    lines.push('  Type summary:');
    const maxLen = Math.max(...types.map(([k]) => k.length));
    for (const [type, count] of types) {
      lines.push(`    ${type.padEnd(maxLen)}   ${count}`);
    }
  }

  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const infos = report.issues.filter((i) => i.severity === 'info');

  if (errors.length > 0) {
    lines.push('');
    lines.push(`  Errors (${errors.length}):`);
    for (const issue of errors) {
      const id = issue.tokenId !== undefined ? `    ${issue.tokenId.padEnd(30)}` : '';
      lines.push(`    ✗ ${issue.code.padEnd(24)}${id}${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push(`  Warnings (${warnings.length}):`);
    for (const issue of warnings) {
      const id = issue.tokenId !== undefined ? `    ${issue.tokenId.padEnd(30)}` : '';
      lines.push(`    ! ${issue.code.padEnd(24)}${id}${issue.message}`);
    }
  }

  if (infos.length > 0) {
    lines.push('');
    lines.push(`  Info (${infos.length}):`);
    for (const issue of infos) {
      const id = issue.tokenId !== undefined ? `    ${issue.tokenId.padEnd(30)}` : '';
      lines.push(`    ℹ ${issue.code.padEnd(24)}${id}${issue.message}`);
    }
  }

  lines.push('');
  return lines.join('\n');
};
