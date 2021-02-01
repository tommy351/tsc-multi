import { resolve } from "path";
import yargs from "yargs/yargs";
import { build } from "./build";
import { readJSON } from "fs-extra";

const args = yargs(process.argv.slice(2))
  .options({
    watch: {
      type: "boolean",
      alias: "w",
      description: "Watch input files and rebuild when they are changed.",
    },
    clean: {
      type: "boolean",
      description: "Delete built files.",
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

async function readConfig(path: string) {
  try {
    return await readJSON(path);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

(async () => {
  const cwd = args.cwd || process.cwd();
  const configPath = resolve(cwd, args.config || "tsc-multi.json");
  const config = await readConfig(configPath);
  const code = await build({
    projects: ([] as string[]).concat(args.projects || []),
    watch: args.watch,
    clean: args.clean,
    verbose: args.verbose,
    cwd,
    ...config,
  });

  process.exitCode = code;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
