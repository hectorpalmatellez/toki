import { describe, it, expect } from "vitest";
import {
  ColorTransformer,
  DimensionTransformer,
  FontFamilyTransformer,
  FontWeightTransformer,
  ShadowTransformer,
  TypographyTransformer,
  dimensionToRn,
  dimensionToRnNumber,
  fontFamilyToRn,
  fontWeightToRn,
  getTransformer,
  normalizeColor,
  registerTransformer,
  shadowToRn,
  splitColorAlpha,
  transformTokens,
  transformValue,
  typographyToRn,
  type RnShadow,
} from "./transformer.js";
import type { OutputFormat, ResolvedToken, TokenType } from "./types.js";

const token = (
  path: readonly string[],
  type: ResolvedToken["type"],
  value: ResolvedToken["value"],
): ResolvedToken => ({
  path,
  id: path.join("."),
  name: path[path.length - 1]!,
  type,
  value,
});

const rn = { platform: "react-native" as OutputFormat };
const css = { platform: "css" as OutputFormat };

/** Deterministic PRNG (mulberry32) for property-style tests. */
const prng = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const HEX_DIGITS = "0123456789abcdefABCDEF";

const randomHex = (rand: () => number, length: number): string => {
  let out = "#";
  for (let i = 0; i < length; i++) {
    out += HEX_DIGITS[Math.floor(rand() * HEX_DIGITS.length)];
  }
  return out;
};

/** RN-accepted color formats: #rrggbb, #rrggbbaa, or a CSS color function/keyword. */
const RN_COLOR = /^(#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z][a-z0-9]*(?:\([^)]*\))?)$/i;

describe("transformer registry", () => {
  it("registers the default transformers for the documented types", () => {
    const expected: readonly TokenType[] = [
      "color",
      "dimension",
      "fontWeight",
      "shadow",
      "fontFamily",
      "typography",
    ];
    for (const type of expected) {
      expect(getTransformer(type)).toBeDefined();
    }
  });

  it("returns the raw value for types without a registered transformer", () => {
    const t = token(["motion", "ease"], "cubicBezier", [0.4, 0, 0.2, 1]);
    expect(transformValue(t, rn)).toEqual([0.4, 0, 0.2, 1]);
  });

  it("transformTokens applies the platform context to every token", () => {
    const tokens = [token(["spacing", "small"], "dimension", "8px")];
    expect(transformTokens(tokens, "react-native")[0]?.value).toBe(8);
    expect(transformTokens(tokens, "css")[0]?.value).toBe("8px");
  });

  it("supports overriding a transformer via registerTransformer", () => {
    const original = getTransformer("number");
    try {
      registerTransformer("number", () => 42);
      expect(transformValue(token(["n", "x"], "number", 1), css)).toBe(42);
    } finally {
      if (original !== undefined) registerTransformer("number", original);
    }
  });
});

describe("normalizeColor / ColorTransformer", () => {
  it("expands 3-digit shorthand hex", () => {
    expect(normalizeColor("#f80")).toBe("#ff8800");
  });

  it("expands 4-digit shorthand hex (with alpha)", () => {
    expect(normalizeColor("#f80c")).toBe("#ff8800cc");
  });

  it("lowercases long hex", () => {
    expect(normalizeColor("#1A73E8")).toBe("#1a73e8");
    expect(normalizeColor("#1A73E8CC")).toBe("#1a73e8cc");
  });

  it("passes non-hex colors through unchanged", () => {
    expect(normalizeColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(normalizeColor("rebeccapurple")).toBe("rebeccapurple");
    expect(normalizeColor("#12345")).toBe("#12345"); // invalid length — untouched
  });

  it("ignores non-string values", () => {
    expect(ColorTransformer(token(["c", "n"], "color", 5), rn).valueOf()).toBe(5);
  });

  it("property: any valid hex becomes a valid RN color with doubled digits preserved", () => {
    const rand = prng(0xfeed);
    for (let i = 0; i < 1000; i++) {
      const length = [3, 4, 6, 8][Math.floor(rand() * 4)] as number;
      const hex = randomHex(rand, length);
      const normalized = normalizeColor(hex);
      expect(normalized).toMatch(RN_COLOR);
      expect(normalized.startsWith("#")).toBe(true);
      const digits = normalized.slice(1);
      if (length <= 4) {
        // Shorthand expands by doubling each digit.
        expect(digits).toHaveLength(length * 2);
        for (let d = 0; d < length; d++) {
          expect(digits[d * 2]).toBe(digits[d * 2 + 1]);
          expect(digits[d * 2]?.toLowerCase()).toBe((hex[d + 1] as string).toLowerCase());
        }
      } else {
        expect(digits).toHaveLength(length);
        expect(digits).toBe(hex.slice(1).toLowerCase());
      }
    }
  });
});

describe("dimensionToRn / DimensionTransformer", () => {
  it("converts px strings to raw numbers", () => {
    expect(dimensionToRn("8px")).toBe(8);
    expect(dimensionToRn("-4px")).toBe(-4);
    expect(dimensionToRn("2.5px")).toBe(2.5);
    expect(dimensionToRn("0px")).toBe(0);
  });

  it("converts rem/em using the 16px base", () => {
    expect(dimensionToRn("1.5rem")).toBe(24);
    expect(dimensionToRn("2em")).toBe(32);
  });

  it("converts bare numeric strings and passes numbers through", () => {
    expect(dimensionToRn("8")).toBe(8);
    expect(dimensionToRn(8)).toBe(8);
  });

  it("passes non-convertible values through unchanged", () => {
    expect(dimensionToRn("50%")).toBe("50%");
    expect(dimensionToRn("auto")).toBe("auto");
    expect(dimensionToRn([1])).toEqual([1]);
  });

  it("dimensionToRnNumber coerces failures to 0", () => {
    expect(dimensionToRnNumber("10px")).toBe(10);
    expect(dimensionToRnNumber("nope")).toBe(0);
    expect(dimensionToRnNumber(undefined)).toBe(0);
  });

  it("only transforms for the react-native platform", () => {
    const t = token(["spacing", "small"], "dimension", "8px");
    expect(DimensionTransformer(t, rn)).toBe(8);
    expect(DimensionTransformer(t, css)).toBe("8px");
  });

  it("property: any px/rem value converts to the equivalent number", () => {
    const rand = prng(0xd1ce);
    for (let i = 0; i < 500; i++) {
      const magnitude = Math.floor(rand() * 10000) / 100;
      const px = dimensionToRn(`${magnitude}px`);
      expect(px).toBe(magnitude);
      const rem = dimensionToRn(`${magnitude}rem`);
      expect(rem).toBe(magnitude * 16);
    }
  });
});

describe("fontWeightToRn / FontWeightTransformer", () => {
  it("maps keywords to canonical numeric strings", () => {
    expect(fontWeightToRn("normal")).toBe("400");
    expect(fontWeightToRn("bold")).toBe("700");
    expect(fontWeightToRn("Bold")).toBe("700");
  });

  it("stringifies numbers and numeric strings", () => {
    expect(fontWeightToRn(600)).toBe("600");
    expect(fontWeightToRn("500")).toBe("500");
  });

  it("passes unknown values through", () => {
    expect(fontWeightToRn("black")).toBe("black");
    expect(fontWeightToRn(true)).toBe(true);
  });

  it("only transforms for the react-native platform", () => {
    const t = token(["w", "strong"], "fontWeight", "bold");
    expect(FontWeightTransformer(t, rn)).toBe("700");
    expect(FontWeightTransformer(t, css)).toBe("bold");
  });

  it("property: any hundred weight 100–900 becomes its string form", () => {
    for (let weight = 100; weight <= 900; weight += 100) {
      expect(fontWeightToRn(weight)).toBe(String(weight));
      expect(fontWeightToRn(String(weight))).toBe(String(weight));
    }
  });
});

describe("fontFamilyToRn / FontFamilyTransformer", () => {
  it("reduces a family list to its first entry, stripping quotes", () => {
    expect(fontFamilyToRn("Inter, sans-serif")).toBe("Inter");
    expect(fontFamilyToRn("'SF Pro Text', monospace")).toBe("SF Pro Text");
    expect(fontFamilyToRn("Inter")).toBe("Inter");
  });

  it("passes non-strings through", () => {
    expect(fontFamilyToRn(3)).toBe(3);
  });

  it("only transforms for the react-native platform", () => {
    const t = token(["font", "sans"], "fontFamily", "Inter, sans-serif");
    expect(FontFamilyTransformer(t, rn)).toBe("Inter");
    expect(FontFamilyTransformer(t, css)).toBe("Inter, sans-serif");
  });
});

describe("typographyToRn / TypographyTransformer", () => {
  it("normalizes known composite fields and keeps unknown ones", () => {
    const out = typographyToRn({
      fontFamily: "Inter, sans-serif",
      fontSize: "16px",
      lineHeight: "1.5",
      letterSpacing: "0.5px",
      fontWeight: "bold",
      fontStyle: "italic",
    });
    expect(out).toEqual({
      fontFamily: "Inter",
      fontSize: 16,
      lineHeight: 1.5,
      letterSpacing: 0.5,
      fontWeight: "700",
      fontStyle: "italic",
    });
  });

  it("passes non-object values and arrays through", () => {
    expect(typographyToRn("text")).toBe("text");
    expect(typographyToRn([1, 2])).toEqual([1, 2]);
  });

  it("only transforms for the react-native platform", () => {
    const t = token(["type", "body"], "typography", { fontSize: "16px" });
    expect(TypographyTransformer(t, rn)).toEqual({ fontSize: 16 });
    expect(TypographyTransformer(t, css)).toEqual({ fontSize: "16px" });
  });
});

describe("splitColorAlpha", () => {
  it("splits 8-digit hex into base + alpha", () => {
    expect(splitColorAlpha("#00000080")).toEqual({ base: "#000000", alpha: 0.5 });
  });

  it("splits rgba() into rgb() + alpha", () => {
    expect(splitColorAlpha("rgba(0,0,0,0.25)")).toEqual({ base: "rgb(0, 0, 0)", alpha: 0.25 });
  });

  it("keeps opaque colors at alpha 1", () => {
    expect(splitColorAlpha("#1a73e8")).toEqual({ base: "#1a73e8", alpha: 1 });
    expect(splitColorAlpha("rgb(1, 2, 3)")).toEqual({ base: "rgb(1, 2, 3)", alpha: 1 });
    expect(splitColorAlpha("rebeccapurple")).toEqual({ base: "rebeccapurple", alpha: 1 });
  });
});

describe("shadowToRn / ShadowTransformer", () => {
  it("converts a single shadow object to the RN shape", () => {
    const out = shadowToRn({ x: 0, y: 4, blur: 8, color: "rgba(0,0,0,0.25)" }) as RnShadow;
    expect(out).toEqual({
      shadowColor: "rgb(0, 0, 0)",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 4,
    });
  });

  it("accepts dimension strings for offsets and defaults missing color", () => {
    const out = shadowToRn({ x: "2px", y: "1rem" }) as RnShadow;
    expect(out.shadowOffset).toEqual({ width: 2, height: 16 });
    expect(out.shadowColor).toBe("#000000");
    expect(out.shadowOpacity).toBe(1);
  });

  it("maps multi-shadow arrays entry by entry", () => {
    const out = shadowToRn([{ x: 1, y: 1, blur: 2, color: "#000" }, "weird"]);
    expect(Array.isArray(out)).toBe(true);
    const [first, second] = out as readonly unknown[];
    expect((first as RnShadow).shadowRadius).toBe(1);
    expect(second).toBe("weird");
  });

  it("passes primitive values through", () => {
    expect(shadowToRn("none")).toBe("none");
  });

  it("only transforms for the react-native platform", () => {
    const raw = { x: 0, y: 4, blur: 8, color: "#000" };
    const t = token(["shadow", "sm"], "shadow", raw);
    expect(ShadowTransformer(t, css)).toEqual(raw);
    expect(ShadowTransformer(t, rn)).toMatchObject({ shadowRadius: 4 });
  });

  it("property: any shadow object yields a valid RN shadow", () => {
    const rand = prng(0x5eed);
    for (let i = 0; i < 500; i++) {
      const x = Math.floor(rand() * 40) - 20;
      const y = Math.floor(rand() * 40) - 20;
      const blur = Math.floor(rand() * 64);
      const alpha = Math.round(rand() * 100) / 100;
      const out = shadowToRn({
        x,
        y,
        blur,
        color: `rgba(10,20,30,${alpha})`,
      }) as RnShadow;
      expect(out.shadowOffset).toEqual({ width: x, height: y });
      expect(out.shadowRadius).toBeCloseTo(blur / 2, 2);
      expect(out.shadowOpacity).toBeGreaterThanOrEqual(0);
      expect(out.shadowOpacity).toBeLessThanOrEqual(1);
      expect(out.elevation).toBeGreaterThanOrEqual(1);
      expect(out.shadowColor).toBe("rgb(10, 20, 30)");
    }
  });
});
