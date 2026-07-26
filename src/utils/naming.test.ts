import { describe, it, expect } from "vitest";
import {
  toCamelCase,
  toKebabCase,
  toConstantCase,
  toPascalCase,
} from "./naming.js";

describe("naming", () => {
  it("camelCase", () => {
    expect(toCamelCase(["color", "primary"])).toBe("colorPrimary");
    expect(toCamelCase(["color", "primary", "500"])).toBe("colorPrimary500");
    expect(toCamelCase(["color", "brand", "primary"])).toBe("colorBrandPrimary");
    expect(toCamelCase(["fontSize"])).toBe("fontSize");
  });

  it("kebab-case", () => {
    expect(toKebabCase(["color", "primary"])).toBe("color-primary");
    expect(toKebabCase(["color", "brandColor"])).toBe("color-brand-color");
  });

  it("CONSTANT_CASE", () => {
    expect(toConstantCase(["color", "primary"])).toBe("COLOR_PRIMARY");
  });

  it("PascalCase", () => {
    expect(toPascalCase(["color", "primary"])).toBe("ColorPrimary");
  });

  it("handles already-separated segments (-, _, .)", () => {
    expect(toCamelCase(["color", "brand-blue"])).toBe("colorBrandBlue");
    expect(toKebabCase(["font", "size_md"])).toBe("font-size-md");
  });
});