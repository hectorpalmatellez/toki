import type { TokenType } from '../core/types.js';
import { inferTokenType } from './infer-type.js';

export interface ExtractedToken {
  readonly id: string;
  readonly value: string;
  readonly inferredType: TokenType | undefined;
  readonly source: string;
  readonly line: number;
}

const CSS_CUSTOM_PROP = /--([\w-]+)\s*:\s*([^;{}]+)/g;

const stripComments = (content: string): string => {
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

const lineAtOffset = (content: string, offset: number): number => {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
};

export const extractCssProperties = (content: string, source: string): readonly ExtractedToken[] => {
  const stripped = stripComments(content);
  const tokens: ExtractedToken[] = [];

  for (const match of stripped.matchAll(CSS_CUSTOM_PROP)) {
    const id = match[1] as string;
    const rawValue = match[2] as string;
    const value = rawValue.replace(/\s*!important\s*$/, '').trim();
    const inferredType = inferTokenType(value);
    const line = lineAtOffset(stripped, match.index ?? 0);

    tokens.push({ id, value, inferredType, source, line });
  }

  return tokens;
};
