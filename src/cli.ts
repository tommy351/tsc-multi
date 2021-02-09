import { resolve } from "path";
import yargs from "yargs/yargs";
import { build } from "./build";
import { loadConfig } from "./config";

const args = yargs(process.argv.slice(2))
  .options({
    watch: {
      type: "boolean",
      alias: "w",
      description: "Watch input files and rebuild when they are changed.",
    },
    clean: {
      type: "boolean",
      description: "Delete built files. Only available when rootDir is set.",
    },
    verbose: {
      type: "boolean",
      description: "Print debug logs.",
    },
    cwd: {
      type: "string",
      description: "Current working directory.",
    },
    config: {
      type: "string",
      description: "Path of the config file. Default to $CWD/tsc-multi.json.",
    },
    compiler: {
      type: "string",
      description: "Set a custom TypeScript compiler.",
    },
  })
  .command(
    "$0 [projects..]",
    "Build one or more TypeScript projects to multiple targets.",
    (cmd) => {
      return cmd.positional("projects", {
        type: "string",
        description:
          "Path of TypeScript projects or tsconfig.json files. At least one project is required.",
      });
    }
  )
  .showHelpOnFail(false).argv;

(async () => {
  const projects = ([] as string[]).concat(args.projects || []);
  const config = await loadConfig({
    cwd: args.cwd,
    path: args.config,
  });

  if (projects.length) {
    config.projects = projects.map((path) => resolve(config.cwd, path));
  }

  if (args.compiler) {
    config.compiler = args.compiler;
  }

  const code = await build({
    ...config,
    verbose: args.verbose,
    watch: args.watch,
    clean: args.clean,
  });

  process.exitCode = code;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
