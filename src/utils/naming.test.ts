import { describe, it, expect } from "vitest";
import {
  toCamelCase,
  toKebabCase,
  toConstantCase,
  toPascalCase,
  toScreamingSnakeCase,
  getNamingFunction,
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

  it("SCREAMING_SNAKE_CASE is an alias for CONSTANT_CASE", () => {
    expect(toScreamingSnakeCase(["color", "primary"])).toBe("COLOR_PRIMARY");
    expect(toScreamingSnakeCase(["fontSize", "large"])).toBe("FONT_SIZE_LARGE");
  });

  it("handles already-separated segments (-, _, .)", () => {
    expect(toCamelCase(["color", "brand-blue"])).toBe("colorBrandBlue");
    expect(toKebabCase(["font", "size_md"])).toBe("font-size-md");
  });
});

describe("getNamingFunction", () => {
  it("returns toCamelCase for camelCase", () => {
    const fn = getNamingFunction("camelCase");
    expect(fn(["color", "primary"])).toBe("colorPrimary");
  });

  it("returns toKebabCase for kebab-case", () => {
    const fn = getNamingFunction("kebab-case");
    expect(fn(["color", "primary"])).toBe("color-primary");
  });

  it("returns toConstantCase for CONSTANT_CASE", () => {
    const fn = getNamingFunction("CONSTANT_CASE");
    expect(fn(["color", "primary"])).toBe("COLOR_PRIMARY");
  });

  it("returns toScreamingSnakeCase for SCREAMING_SNAKE_CASE", () => {
    const fn = getNamingFunction("SCREAMING_SNAKE_CASE");
    expect(fn(["color", "primary"])).toBe("COLOR_PRIMARY");
  });
});