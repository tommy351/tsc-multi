import yargs from "yargs/yargs";
import { build } from "./build";
import { loadConfig, resolveProjectPath } from "./config";

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
    "Build multiple TypeScript projects to multiple targets.",
    (cmd) => {
      return cmd
        .positional("projects", {
          type: "string",
          description:
            "Path of TypeScript projects or tsconfig.json files. Default to $CWD.",
        })
        .example([
          ["$0", "Build current folder."],
          ["$0 --watch", "Watch files and rebuild when changed."],
          ["$0 --clean", "Delete built files."],
          ["$0 --config ./conf.json", "Custom config path."],
          ["$0 ./pkg-a ./pkg-b", "Build multiple projects."],
        ]);
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
    config.projects = await resolveProjectPath(config.cwd, projects);
  }

  if (!config.projects.length) {
    config.projects = [config.cwd];
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
