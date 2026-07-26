import { describe, it, expect } from "vitest";
import { categoryName, groupTokens, inlineLiteral, jsKey, serializeTokenTree } from "./grouping.js";
import type { ResolvedToken, TokenValue } from "../core/types.js";
import { GeneratorError } from "./errors.js";

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

describe("categoryName", () => {
  it("pluralizes regular category names", () => {
    expect(categoryName("color")).toBe("colors");
    expect(categoryName("shadow")).toBe("shadows");
    expect(categoryName("font")).toBe("fonts");
  });

  it("keeps uncountable and already-plural names", () => {
    expect(categoryName("spacing")).toBe("spacing");
    expect(categoryName("typography")).toBe("typography");
    expect(categoryName("settings")).toBe("settings");
  });

  it("camelCases multi-word segments before pluralizing", () => {
    // "borderRadius" already ends in "s", so it is left as-is.
    expect(categoryName("border-radius")).toBe("borderRadius");
    expect(categoryName("font-family")).toBe("fontFamilys");
  });
});

describe("groupTokens", () => {
  it("separates scalars from categories preserving document order", () => {
    const grouped = groupTokens([
      token(["brand"], "color", "#fff"),
      token(["color", "primary"], "color", "#000"),
      token(["spacing", "small"], "dimension", "8px"),
      token(["color", "brand", "accent"], "color", "#f80"),
    ]);
    expect(grouped.scalars.map((t) => t.id)).toEqual(["brand"]);
    expect([...grouped.categories.keys()]).toEqual(["colors", "spacing"]);
  });

  it("throws GeneratorError when a group nests under a leaf", () => {
    expect(() =>
      groupTokens([
        token(["color", "brand"], "color", "#fff"),
        token(["color", "Brand", "primary"], "color", "#000"),
      ]),
    ).toThrow(GeneratorError);
  });
});

describe("jsKey / inlineLiteral / serializeTokenTree", () => {
  it("quotes keys that are not valid identifiers", () => {
    expect(jsKey("primary")).toBe("primary");
    expect(jsKey("500")).toBe('"500"');
    expect(jsKey("with space")).toBe('"with space"');
  });

  it("serializes primitives and structures inline", () => {
    expect(inlineLiteral("x")).toBe('"x"');
    expect(inlineLiteral(4)).toBe("4");
    expect(inlineLiteral(true)).toBe("true");
    expect(inlineLiteral([0.4, 0, 0.2, 1])).toBe("[0.4, 0, 0.2, 1]");
    expect(inlineLiteral({ fontSize: "16px" })).toBe('{ fontSize: "16px" }');
    expect(inlineLiteral(Number.NaN)).toBe("null");
    expect(inlineLiteral(null as unknown as TokenValue)).toBe("null");
  });

  it("serializes a nested tree with indentation and trailing commas", () => {
    const grouped = groupTokens([token(["color", "brand", "accent"], "color", "#f80")]);
    const node = grouped.categories.get("colors");
    expect(node).toBeDefined();
    expect(serializeTokenTree(node!)).toBe(
      ["{", "  brand: {", '    accent: "#f80",', "  },", "}"].join("\n"),
    );
  });
});
