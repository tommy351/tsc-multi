import { fork } from "child_process";
import { join } from "path";
import { Config, Target } from "./config";
import { WorkerOptions } from "./worker/types";
import stringToStream from "string-to-stream";
import { Stream } from "stream";
import { trimPrefix } from "./utils";
import { getReportStyles } from "./report";
import onExit from "signal-exit";
import pAll from "p-all";
import debug from "./debug";

const WORKER_PATH = join(__dirname, "worker/entry.js");
const DEFAULT_EXTNAME = ".js";

type Stdio = "ignore" | "inherit" | Stream;

/**
 * Validates collection of {@link Target} objects including that they can be
 * used in conjunction with each other.
 *
 * 1. Asserts that the extname of each target starts with a period.
 * 2. Asserts that collection of targets generates unique output file paths.
 *    Either the extensions must be different or the output directories must
 *    be different.
 * 3. Asserts that packageOverrides only reference "package.json" paths.
 *
 * @param targets - Collection of targets
 *
 * @remarks Does not validate that out directory specified in any target is
 * unique compared to a target using the value from tsconfig settings.
 */
function validateTargets(targets: readonly Target[]) {
  // Create array of strings representing the combination of extensions
  // output and output directory.
  const outputDifferentiation = targets.map(
    (target) =>
      `${target.extname || DEFAULT_EXTNAME}+${
        target.outDir ?? "<tscfg-outdir>"
      }`
  );
  const outputMap = new Map<
    string,
    { index: number; outDir: string | undefined }
  >();

  for (let i = 0; i < outputDifferentiation.length; i++) {
    const uniqueOutput = outputDifferentiation[i];

    if (!uniqueOutput.startsWith(".")) {
      throw new Error(`targets[${i}].extname must be started with ".".`);
    }

    const existedIndex = outputMap.get(uniqueOutput);

    // Confirm output is unique.
    if (existedIndex !== undefined) {
      throw new Error(
        `targets[${i}].extname and/or .outDir is already used in targets[${existedIndex.index}]`
      );
    }

    outputMap.set(uniqueOutput, { index: i, outDir: targets[i].outDir });

    const packageOverrides = targets[i].packageOverrides;
    if (packageOverrides) {
      Object.keys(packageOverrides).forEach((packageName) => {
        if (!packageName.endsWith("package.json")) {
          throw new Error(
            `targets[${i}].packageOverrides[${packageName}] may only reference "package.json" paths`
          );
        }
      });
    }
  }
}

async function runWorker({
  stdout,
  stderr,
  ...options
}: WorkerOptions & Pick<BuildOptions, "stdout" | "stderr">): Promise<number> {
  const worker = fork(WORKER_PATH, [], {
    cwd: options.cwd,
    stdio: ["pipe", stdout, stderr, "ipc"],
  });

  if (worker.stdin) {
    stringToStream(JSON.stringify(options)).pipe(worker.stdin);
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

export interface BuildOptions extends Config {
  watch?: boolean;
  clean?: boolean;
  verbose?: boolean;
  dry?: boolean;
  force?: boolean;
  stdout?: Stdio;
  stderr?: Stdio;
  maxWorkers?: number;
}

export async function build({
  targets: inputTargets,
  stdout = "inherit",
  stderr = "inherit",
  projects,
  maxWorkers,
  ...options
}: BuildOptions): Promise<number> {
  if (!projects.length) {
    throw new Error("At least one project is required");
  }

  const targets: readonly Target[] =
    inputTargets && inputTargets.length ? inputTargets : [{}];

  validateTargets(targets);

  const reportStyles = getReportStyles();

  const codes = await pAll(
    targets.map(
      ({ extname, transpileOnly, packageOverrides, ...target }, i) => {
        const prefix = `[${trimPrefix(extname || DEFAULT_EXTNAME, ".")}]: `;
        const prefixStyle = reportStyles[i % reportStyles.length];

        return () => {
          return runWorker({
            ...options,
            projects,
            stdout,
            stderr,
            extname,
            packageOverrides,
            target,
            reportPrefix: prefixStyle(prefix),
            transpileOnly,
          });
        };
      }
    ),
    { concurrency: maxWorkers }
  );

  return codes.find((code) => code !== 0) || 0;
}
