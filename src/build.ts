import { fork } from "child_process";
import { join } from "path";
import { Config, Target } from "./config";
import { WorkerOptions } from "./worker/types";
import stringToStream from "string-to-stream";
import { Stream } from "stream";
import { trimPrefix } from "./utils";
import chalk from "chalk";
import { getReportStyles } from "./report";
import onExit from "signal-exit";
import debug from "./debug";

const WORKER_PATH = join(__dirname, "worker/entry.js");
const DEFAULT_EXTNAME = ".js";

type Stdio = "ignore" | "inherit" | Stream;

function validateTargets(targets: readonly Target[]) {
  const extnames = targets.map((target) => target.extname || DEFAULT_EXTNAME);
  const extMap = new Map<string, number>();

  for (let i = 0; i < extnames.length; i++) {
    const ext = extnames[i];

    if (!ext.startsWith(".")) {
      throw new Error(`targets[${i}].extname must be started with ".".`);
    }

    const existedIndex = extMap.get(ext);

    if (existedIndex != null) {
      throw new Error(
        `targets[${i}].extname is already used in targets[${existedIndex}].extname`
      );
    }

    extMap.set(ext, i);
  }
}

export interface BuildOptions extends Config {
  watch?: boolean;
  clean?: boolean;
  verbose?: boolean;
  stdout?: Stdio;
  stderr?: Stdio;
}

export async function build({
  targets: inputTargets,
  stdout = "inherit",
  stderr = "inherit",
  verbose,
  watch,
  clean,
  projects,
  cwd,
  compiler,
}: BuildOptions): Promise<number> {
  if (!projects.length) {
    throw new Error("At least one project is required");
  }

  const targets = inputTargets && inputTargets.length ? inputTargets : [{}];

  validateTargets(targets);

  const reportStyles = getReportStyles();

  async function runWorker(
    target: Target,
    prefixStyle: chalk.Chalk
  ): Promise<number> {
    const prefix = `[${trimPrefix(target.extname || DEFAULT_EXTNAME, ".")}]: `;
    const data: WorkerOptions = {
      target,
      verbose,
      watch,
      clean,
      projects,
      compiler,
      cwd,
      reportPrefix: prefixStyle(prefix),
    };

    const worker = fork(WORKER_PATH, [], {
      cwd,
      stdio: ["pipe", stdout, stderr, "ipc"],
    });

    if (worker.stdin) {
      stringToStream(JSON.stringify(data)).pipe(worker.stdin);
    }

    const removeExitHandler = onExit((code, signal) => {
      debug(
        `Killing worker ${worker.pid} because parent process received ${
          signal || code || 0
        }`
      );

      worker.kill(code || "SIGTERM");
    });

    try {
      return await new Promise<number>((resolve, reject) => {
        worker.on("error", reject);
        worker.on("exit", resolve);
      });
    } finally {
      removeExitHandler();
    }
  }

  const codes = await Promise.all(
    targets.map((target, i) =>
      runWorker(target, reportStyles[i % reportStyles.length])
    )
  );

  return codes.find((code) => code !== 0) || 0;
}
