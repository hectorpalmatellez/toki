import { describe, it, expect } from "vitest";
import { parseTokenDocument } from "./parser.js";
import { resolveDocument } from "./resolver.js";
import { generate } from "./pipeline.js";
import type { DesignTokenDocument } from "./types.js";

const generateTokens = (count: number): Record<string, unknown> => {
  const root: Record<string, unknown> = {
    $type: "color",
  };
  for (let i = 0; i < count; i++) {
    const hex = `#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0")}`;
    root[`token${i}`] = { $value: hex };
  }
  return root;
};

const resolveTokens = (count: number): DesignTokenDocument => {
  const colors = generateTokens(count);
  const spacing: Record<string, unknown> = { $type: "dimension" };
  for (let i = 0; i < count; i++) {
    spacing[`size${i}`] = { $value: `${(i % 10) + 1}px` };
  }
  return parseTokenDocument({
    color: colors,
    spacing,
  });
};

const formats = ["css", "js", "react-native", "angular", "angular-11", "svelte", "react"];

const runWithTiming = <T>(fn: () => T, iterations = 5): { result: T; times: number[] } => {
  const times: number[] = [];
  let result: T = undefined as unknown as T;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    result = fn();
    times.push(performance.now() - start);
  }
  return { result, times };
};

const percentile = (sorted: number[], p: number): number => {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
};

const tokenSizes = [500, 1000, 5000];

for (const size of tokenSizes) {
  describe(`benchmark: ${size} tokens`, () => {
    const doc = resolveTokens(size);
    const resolved = resolveDocument(doc);

    const parseThreshold = size <= 1000 ? 100 : 200;
    it(`parses ${size} tokens in <${parseThreshold}ms (p95)`, () => {
      const { times } = runWithTiming(() => {
        parseTokenDocument({
          color: generateTokens(size),
          spacing: { $type: "dimension", a: { $value: "1px" } },
        });
      });
      const sorted = [...times].sort((a, b) => a - b);
      const p95 = percentile(sorted, 95);
      expect(p95).toBeLessThan(parseThreshold);
    });

    const resolveThreshold = size <= 1000 ? 100 : 200;
    it(`resolves ${size} tokens in <${resolveThreshold}ms (p95)`, () => {
      const { times } = runWithTiming(() => resolveDocument(doc));
      const sorted = [...times].sort((a, b) => a - b);
      const p95 = percentile(sorted, 95);
      expect(p95).toBeLessThan(resolveThreshold);
    });

    const genThreshold = size <= 1000 ? 500 : 2000;
    it(`generates all platforms from ${size} tokens in <${genThreshold}ms (p95)`, () => {
      const { times } = runWithTiming(() => generate(resolved, { formats }));
      const sorted = [...times].sort((a, b) => a - b);
      const p95 = percentile(sorted, 95);
      expect(p95).toBeLessThan(genThreshold);
    });
  });
}
