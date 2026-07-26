import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  discoverConfig,
  loadConfigFile,
  validateConfig,
  loadConfig,
  mergeConfig,
  DEFAULT_NAMING,
} from "./config.js";
import { ConfigError } from "../utils/errors.js";

const uniqueDir = (): string => {
  const dir = join(tmpdir(), `toki-config-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

describe("discoverConfig", () => {
  it("finds toki.config.ts in the given directory", () => {
    const dir = uniqueDir();
    writeFileSync(join(dir, "toki.config.ts"), "export default {}");
    expect(discoverConfig(dir)).toBe(join(dir, "toki.config.ts"));
  });

  it("finds toki.config.js", () => {
    const dir = uniqueDir();
    writeFileSync(join(dir, "toki.config.js"), "module.exports = {}");
    expect(discoverConfig(dir)).toBe(join(dir, "toki.config.js"));
  });

  it("finds toki.config.mjs", () => {
    const dir = uniqueDir();
    writeFileSync(join(dir, "toki.config.mjs"), "export default {}");
    expect(discoverConfig(dir)).toBe(join(dir, "toki.config.mjs"));
  });

  it("returns undefined when no config file exists", () => {
    const dir = uniqueDir();
    expect(discoverConfig(dir)).toBeUndefined();
  });
});

describe("loadConfigFile", () => {
  it("loads a .ts config file via jiti", () => {
    const dir = uniqueDir();
    const configPath = join(dir, "toki.config.ts");
    writeFileSync(
      configPath,
      'export default { input: "./tokens.json", output: "./dist" }',
    );
    const config = loadConfigFile(configPath) as Record<string, unknown>;
    expect(config["input"]).toBe("./tokens.json");
    expect(config["output"]).toBe("./dist");
  });

  it("loads a .js config file via jiti", () => {
    const dir = uniqueDir();
    const configPath = join(dir, "toki.config.js");
    writeFileSync(
      configPath,
      'module.exports = { input: "./tokens.json", output: "./dist" }',
    );
    const config = loadConfigFile(configPath) as Record<string, unknown>;
    expect(config["input"]).toBe("./tokens.json");
    expect(config["output"]).toBe("./dist");
  });

  it("throws ConfigError for invalid config files", () => {
    const dir = uniqueDir();
    const configPath = join(dir, "toki.config.ts");
    writeFileSync(configPath, "throw new Error('broken')");
    expect(() => loadConfigFile(configPath)).toThrow(ConfigError);
  });
});

describe("validateConfig", () => {
  it("accepts a valid minimal config", () => {
    const config = validateConfig({ input: "./tokens.json", output: "./dist" });
    expect(config.input).toBe("./tokens.json");
    expect(config.output).toBe("./dist");
  });

  it("accepts a valid full config", () => {
    const config = validateConfig({
      input: ["./tokens.json", "./extra.json"],
      output: "./dist",
      themes: { light: "./light.json", dark: "./dark.json" },
      formats: ["css", "js"],
      naming: { css: "kebab-case", js: "camelCase" },
      transforms: [(t) => t],
      clean: false,
    });
    expect(config.input).toEqual(["./tokens.json", "./extra.json"]);
    expect(config.themes).toEqual({ light: "./light.json", dark: "./dark.json" });
    expect(config.formats).toEqual(["css", "js"]);
    expect(config.naming).toEqual({ css: "kebab-case", js: "camelCase" });
    expect(config.transforms).toHaveLength(1);
    expect(config.clean).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(() => validateConfig(null)).toThrow(ConfigError);
    expect(() => validateConfig("string")).toThrow(ConfigError);
    expect(() => validateConfig(42)).toThrow(ConfigError);
    expect(() => validateConfig([])).toThrow(ConfigError);
  });

  it("rejects missing input field", () => {
    expect(() => validateConfig({ output: "./dist" })).toThrow(/missing required field "input"/);
  });

  it("rejects missing output field", () => {
    expect(() => validateConfig({ input: "./tokens.json" })).toThrow(/missing required field "output"/);
  });

  it("rejects invalid input type", () => {
    expect(() => validateConfig({ input: 42, output: "./dist" })).toThrow(/must be a string or array/);
  });

  it("rejects invalid output type", () => {
    expect(() => validateConfig({ input: "./tokens.json", output: 42 })).toThrow(/must be a string/);
  });

  it("rejects invalid themes", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", themes: "not-an-object" }),
    ).toThrow(/must be a plain object/);
  });

  it("rejects invalid theme value", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", themes: { light: 42 } }),
    ).toThrow(/must be a file path string/);
  });

  it("rejects invalid format", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", formats: ["vue"] }),
    ).toThrow(/not a valid format/);
  });

  it("rejects invalid naming convention", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", naming: { css: "invalid" } }),
    ).toThrow(/must be one of/);
  });

  it("rejects invalid naming format key", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", naming: { vue: "camelCase" } }),
    ).toThrow(/not a valid format/);
  });

  it("rejects non-function transforms", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", transforms: ["not-a-fn"] }),
    ).toThrow(/must be a function/);
  });

  it("rejects invalid clean type", () => {
    expect(() =>
      validateConfig({ input: "./tokens.json", output: "./dist", clean: "yes" }),
    ).toThrow(/must be a boolean/);
  });

  it("includes source path in error message", () => {
    expect(() => validateConfig(null, "/path/to/config.ts")).toThrow(/config\.ts/);
  });
});

describe("loadConfig", () => {
  it("returns undefined when no config file exists", () => {
    const dir = uniqueDir();
    const prev = process.cwd();
    process.chdir(dir);
    try {
      expect(loadConfig()).toBeUndefined();
    } finally {
      process.chdir(prev);
    }
  });

  it("loads and validates a config file from a specific path", () => {
    const dir = uniqueDir();
    const configPath = join(dir, "toki.config.ts");
    writeFileSync(
      configPath,
      'export default { input: "./tokens.json", output: "./dist" }',
    );
    const config = loadConfig(configPath);
    expect(config).toBeDefined();
    expect(config!.input).toBe("./tokens.json");
  });
});

describe("mergeConfig", () => {
  it("uses CLI input when config has no input", () => {
    const result = mergeConfig(undefined, { input: "./cli-tokens.json", output: "./dist" });
    expect(result.input).toBe("./cli-tokens.json");
  });

  it("uses config input when CLI has none", () => {
    const result = mergeConfig(
      { input: "./config-tokens.json", output: "./dist" },
      {},
    );
    expect(result.input).toBe("./config-tokens.json");
  });

  it("CLI input takes precedence over config", () => {
    const result = mergeConfig(
      { input: "./config-tokens.json", output: "./dist" },
      { input: "./cli-tokens.json" },
    );
    expect(result.input).toBe("./cli-tokens.json");
  });

  it("throws when no input is provided", () => {
    expect(() => mergeConfig(undefined, {})).toThrow(/No input file specified/);
  });

  it("throws when no output is provided", () => {
    expect(() => mergeConfig(undefined, { input: "./tokens.json" })).toThrow(/No output directory specified/);
  });

  it("uses config formats when CLI format is empty", () => {
    const result = mergeConfig(
      { input: "./tokens.json", output: "./dist", formats: ["css"] },
      {},
    );
    expect(result.formats).toEqual(["css"]);
  });

  it("defaults to css and js when nothing specified", () => {
    const result = mergeConfig(
      { input: "./tokens.json", output: "./dist" },
      {},
    );
    expect(result.formats).toEqual(["css", "js"]);
  });

  it("passes through themes from config", () => {
    const result = mergeConfig(
      {
        input: "./tokens.json",
        output: "./dist",
        themes: { light: "./light.json" },
      },
      {},
    );
    expect(result.themes).toEqual({ light: "./light.json" });
  });

  it("passes through naming from config", () => {
    const result = mergeConfig(
      {
        input: "./tokens.json",
        output: "./dist",
        naming: { css: "CONSTANT_CASE" },
      },
      {},
    );
    expect(result.naming).toEqual({ css: "CONSTANT_CASE" });
  });

  it("passes through transforms from config", () => {
    const fn = (t: import("./types.js").ResolvedToken): import("./types.js").ResolvedToken => t;
    const result = mergeConfig(
      {
        input: "./tokens.json",
        output: "./dist",
        transforms: [fn],
      },
      {},
    );
    expect(result.transforms).toHaveLength(1);
  });

  it("defaults clean to true", () => {
    const result = mergeConfig(
      { input: "./tokens.json", output: "./dist" },
      {},
    );
    expect(result.clean).toBe(true);
  });

  it("uses config clean when set", () => {
    const result = mergeConfig(
      { input: "./tokens.json", output: "./dist", clean: false },
      {},
    );
    expect(result.clean).toBe(false);
  });
});

describe("DEFAULT_NAMING", () => {
  it("covers all output formats", () => {
    const formats = ["css", "js", "react-native", "angular", "angular-11", "svelte", "react"];
    for (const fmt of formats) {
      expect(DEFAULT_NAMING[fmt as keyof typeof DEFAULT_NAMING]).toBeDefined();
    }
  });
});
