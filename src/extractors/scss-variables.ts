import { inferTokenType } from './infer-type.js';
import type { ExtractedToken } from './css-properties.js';

const SCSS_VAR = /\$([\w-]+)\s*:\s*([^;]+);/g;

const stripScssComments = (content: string): string => {
  let result = '';
  let i = 0;
  let inBlockComment = false;

  while (i < content.length) {
    if (inBlockComment) {
      const endIdx = content.indexOf('*/', i);
      if (endIdx === -1) break;
      const newlines = content.slice(i, endIdx + 2).split('\n').length - 1;
      result += '\n'.repeat(newlines);
      i = endIdx + 2;
      inBlockComment = false;
    } else {
      if (content.slice(i, i + 2) === '/*') {
        inBlockComment = true;
        i += 2;
      } else if (content.slice(i, i + 2) === '//') {
        const nlIdx = content.indexOf('\n', i);
        if (nlIdx === -1) break;
        i = nlIdx;
      } else {
        result += content[i];
        i++;
      }
    }
  }
  return result;
};

const isScssMap = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return true;
  if (trimmed.startsWith('(') && !trimmed.endsWith(')')) return true;
  return false;
};

const cleanScssFlags = (value: string): string => {
  return value
    .replace(/\s*!default\b/gi, '')
    .replace(/\s*!global\b/gi, '')
    .trim();
};

const lineAtOffset = (content: string, offset: number): number => {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
};

export const extractScssVariables = (content: string, source: string): readonly ExtractedToken[] => {
  const stripped = stripScssComments(content);
  const tokens: ExtractedToken[] = [];

  for (const match of stripped.matchAll(SCSS_VAR)) {
    const id = match[1] as string;
    const rawValue = match[2] as string;

    if (isScssMap(rawValue)) continue;

    const value = cleanScssFlags(rawValue);
    const inferredType = inferTokenType(value);
    const line = lineAtOffset(stripped, match.index ?? 0);

    tokens.push({ id, value, inferredType, source, line });
  }

  return tokens;
};
