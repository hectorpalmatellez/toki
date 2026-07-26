import { describe, it, expect } from "vitest";
import { parseTokenDocument } from "./parser.js";
import { resolveDocument } from "./resolver.js";
import {
  CircularReferenceError,
  MissingReferenceError,
  TokenTypeError,
} from "../utils/errors.js";

const resolve = (raw: unknown) => resolveDocument(parseTokenDocument(raw));

describe("resolver — references", () => {
  it("returns tokens unchanged when there are no references", () => {
    const tokens = resolve({
      color: {
        $type: "color",
        primary: { $value: "#1a73e8" },
        secondary: { $value: "#ff0000" },
      },
    });
    expect(tokens.map((t) => t.id)).toEqual(["color.primary", "color.secondary"]);
    expect(tokens[0]?.value).toBe("#1a73e8");
    expect(tokens[1]?.value).toBe("#ff0000");
  });

  it("expands a direct reference (secondary → primary)", () => {
    const tokens = resolve({
      color: {
        $type: "color",
        primary: { $value: "#1a73e8" },
        secondary: { $value: "{color.primary}" },
      },
    });
    expect(tokens[1]?.value).toBe("#1a73e8");
    expect(tokens[1]?.type).toBe("color");
  });

  it("expands chained references (c → b → a)", () => {
    const tokens = resolve({
      chain: {
        $type: "number",
        a: { $value: 100 },
        b: { $value: "{chain.a}" },
        c: { $value: "{chain.b}" },
      },
    });
    const c = tokens.find((t) => t.id === "chain.c");
    // Pure references preserve the referenced native type (number, not string).
    expect(c?.value).toBe(100);
    expect(typeof c?.value).toBe("number");
  });

  it("interpolates embedded references inside a string", () => {
    const tokens = resolve({
      color: { $type: "color", primary: { $value: "#1a73e8" } },
      message: {
        $type: "fontFamily",
        caption: { $value: "use {color.primary} here" },
      },
    });
    const caption = tokens.find((t) => t.id === "message.caption");
    expect(caption?.value).toBe("use #1a73e8 here");
  });

  it("substitutes references inside composite (shadow) values", () => {
    const tokens = resolve({
      color: { $type: "color", brand: { $value: "#1a73e8" } },
      spacing: { $type: "dimension", sm: { $value: "4px" } },
      shadow: {
        $type: "shadow",
        elevated: {
          $value: {
            x: 0,
            y: "{spacing.sm}",
            blur: 8,
            color: "{color.brand}",
          },
        },
      },
    });
    const elevated = tokens.find((t) => t.id === "shadow.elevated");
    expect(elevated?.value).toEqual({ x: 0, y: "4px", blur: 8, color: "#1a73e8" });
  });
});

describe("resolver — cycle detection", () => {
  it("detects a two-token circular reference", () => {
    expect(() =>
      resolve({
        color: {
          $type: "color",
          a: { $value: "{color.b}" },
          b: { $value: "{color.a}" },
        },
      }),
    ).toThrow(CircularReferenceError);
  });

  it("detects a self-reference", () => {
    expect(() =>
      resolve({
        color: {
          $type: "color",
          a: { $value: "{color.a}" },
        },
      }),
    ).toThrow(CircularReferenceError);
  });

  it("names the tokens involved in the cycle", () => {
    let message = "";
    try {
      resolve({
        color: {
          $type: "color",
          a: { $value: "{color.b}" },
          b: { $value: "{color.c}" },
          c: { $value: "{color.a}" },
        },
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/Circular reference detected/);
    expect(message).toContain("color.a");
    expect(message).toContain("color.b");
    expect(message).toContain("color.c");
  });
});

describe("resolver — missing references", () => {
  it("throws MissingReferenceError for an unknown reference target", () => {
    expect(() =>
      resolve({
        color: {
          $type: "color",
          a: { $value: "{color.doesNotExist}" },
        },
      }),
    ).toThrow(MissingReferenceError);
  });

  it("does not resolve references that point to a group (only leaf tokens)", () => {
    expect(() =>
      resolve({
        color: {
          $type: "color",
          group: { red: { $value: "#f00" } },
          alias: { $value: "{color.group}" },
        },
      }),
    ).toThrow(MissingReferenceError);
  });
});

describe("resolver — $type inheritance", () => {
  it("inherits $type from the enclosing group", () => {
    const tokens = resolve({
      color: { $type: "color", primary: { $value: "#fff" } },
    });
    expect(tokens[0]?.type).toBe("color");
  });

  it("cascades $type through nested groups", () => {
    const tokens = resolve({
      color: {
        $type: "color",
        brand: { primary: { $value: "#fff" }, secondary: { $value: "#000" } },
      },
    });
    expect(tokens.map((t) => t.type)).toEqual(["color", "color"]);
  });

  it("lets a token override the inherited group $type", () => {
    const tokens = resolve({
      color: {
        $type: "color",
        weight: { $value: 700, $type: "fontWeight" },
      },
    });
    expect(tokens[0]?.type).toBe("fontWeight");
  });

  it("throws TokenTypeError when a token has no resolvable $type", () => {
    expect(() =>
      resolve({
        orphan: { token: { $value: "#fff" } },
      }),
    ).toThrow(TokenTypeError);
  });
});

describe("resolver — output contract", () => {
  it("emits resolved tokens in document order", () => {
    const tokens = resolve({
      a: { $type: "number", x: { $value: 1 }, y: { $value: "{a.x}" } },
      b: { $type: "number", z: { $value: "{a.y}" } },
    });
    expect(tokens.map((t) => t.id)).toEqual(["a.x", "a.y", "b.z"]);
  });

  it("freezes resolved tokens", () => {
    const tokens = resolve({
      color: { $type: "color", primary: { $value: "#fff" } },
    });
    expect(Object.isFrozen(tokens[0])).toBe(true);
  });
});