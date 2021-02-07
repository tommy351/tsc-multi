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
      description: "Path of tsc-multi config file.",
    },
  })
  .command(
    "$0 [projects..]",
    "Build one or more TypeScript projects to multiple targets.",
    (cmd) => {
      return cmd.positional("projects", {
        type: "string",
        description: "Path of tsconfig.json",
      });
    }
  )
  .showHelpOnFail(false).argv;

(async () => {
  const projects = ([] as string[]).concat(args.projects || []);
  const config = await loadConfig({
    cwd: args.cwd,
    path: args.config,
    extras: {
      ...(projects.length && { projects }),
    },
  });
  const code = await build({
    ...config,
    ...(args.verbose != null && { verbose: args.verbose }),
    watch: args.watch,
    clean: args.clean,
  });

  process.exitCode = code;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
