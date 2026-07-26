#!/usr/bin/env node
/**
 * Toki CLI entry point.
 *
 *   toki build --input tokens.json --output ./dist --format css,js
 *
 * Drives the pipeline (Parse → Resolve → Generate → Write) and reports a
 * concise summary. Errors of type `TokiError` are formatted cleanly;
 * unknown errors surface their stack under `--verbose`.
 */

import { Command } from "commander";
import type { OutputFormat } from "./core/types.js";
import { runPipeline } from "./core/pipeline.js";
import { writeArtifacts } from "./utils/writer.js";
import { resolveFormats } from "./generators/index.js";
import { TOKI_VERSION } from "./version.js";
import { TokiError } from "./utils/errors.js";

const parseFormats = (raw: readonly string[]): readonly OutputFormat[] => {
  const flat: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) flat.push(trimmed);
    }
  }
  return resolveFormats(flat);
};

const buildCommand = async (options: {
  input: string;
  output: string;
  format: string[];
  clean: boolean;
  verbose: boolean;
}): Promise<void> => {
  const formats = parseFormats(options.format);
  if (options.verbose) {
    console.log(`toki v${TOKI_VERSION}`);
    console.log(`  input:  ${options.input}`);
    console.log(`  output: ${options.output}`);
    console.log(`  formats: ${formats.join(", ")}`);
  }

  const result = await runPipeline({
    input: options.input,
    formats,
    verbose: options.verbose,
  });

  if (options.verbose) {
    console.log(`  resolved ${result.tokenCount} token${result.tokenCount === 1 ? "" : "s"}`);
  }

  const writeResult = await writeArtifacts(options.output, result.artifacts, {
    clean: options.clean,
  });

  console.log(
    `Built ${writeResult.written.length} artifact${writeResult.written.length === 1 ? "" : "s"}` +
      ` from ${result.tokenCount} token${result.tokenCount === 1 ? "" : "s"} → ${options.output}`,
  );
  for (const path of writeResult.written) {
    console.log(`  ${path}`);
  }
};

const program = new Command();

program
  .name("toki")
  .description("Design token pipeline CLI — W3C DTCG in, framework-specific code out")
  .version(TOKI_VERSION);

program
  .command("build")
  .description("Parse tokens and generate output artifacts")
  .requiredOption("-i, --input <path>", "Path to input token file (W3C DTCG JSON)")
  .requiredOption("-o, --output <path>", "Output directory for generated artifacts")
  .option(
    "-f, --format <formats...>",
    'Output formats (comma- or space-separated; "all" for every platform)',
    ["css", "js"],
  )
  .option("--no-clean", "Do not clean output subdirectories before writing")
  .option("--verbose", "Enable verbose output", false)
  .action(async (options) => {
    try {
      await buildCommand({
        input: options.input,
        output: options.output,
        format: options.format as string[],
        clean: options.clean,
        verbose: options.verbose,
      });
    } catch (error) {
      if (error instanceof TokiError) {
        console.error(`error [${error.code}]: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    }
  });

export { program };
export { buildCommand };
export { parseFormats };

export const run = async (): Promise<void> => {
  await program.parseAsync();
};

// Auto-invoke only when executed as the main entry (the bin). Guards against
// firing when this module is imported during tests or as a library barrel.
const isMainEntry = (): boolean => {
  const arg = process.argv[1];
  if (!arg) return false;
  return arg.endsWith("cli.js") || arg.endsWith("cli.ts") || arg.endsWith("toki");
};

if (isMainEntry()) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
