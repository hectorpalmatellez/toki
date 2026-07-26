import { Command } from "commander";

const program = new Command();

program
  .name("toki")
  .description("Design token pipeline CLI — W3C DTCG in, framework-specific code out")
  .version("0.1.0");

program
  .command("build")
  .description("Parse tokens and generate output artifacts")
  .requiredOption("-i, --input <path>", "Path to input token file (W3C DTCG JSON)")
  .requiredOption("-o, --output <path>", "Output directory for generated artifacts")
  .option(
    "-f, --format <formats...>",
    "Output formats to generate",
    ["css", "js"],
  )
  .option("--clean", "Clean output directory before writing", true)
  .option("--verbose", "Enable verbose output", false)
  .action((options) => {
    console.log("toki build — not yet implemented");
    console.log("Options:", options);
  });

export const run = (): void => {
  program.parse();
};

run();
