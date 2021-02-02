import { fork } from "child_process";
import { join } from "path";
import { Config, Target } from "./config";
import { WorkerOptions } from "./worker/types";
import stringToStream from "string-to-stream";

const WORKER_PATH = join(__dirname, "worker/entry.js");

export interface BuildOptions extends Config {
  watch?: boolean;
  clean?: boolean;
}

export async function build({
  targets,
  ...config
}: BuildOptions): Promise<number> {
  function runWorker(target: Target): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const data: WorkerOptions = {
        target,
        verbose: config.verbose,
        watch: config.watch,
        clean: config.clean,
        projects: config.projects,
      };

      const worker = fork(WORKER_PATH, {
        cwd: config.cwd,
        stdio: ["pipe", "inherit", "inherit", "ipc"],
      });

      if (worker.stdin) {
        stringToStream(JSON.stringify(data)).pipe(worker.stdin);
      }

      worker.on("error", reject);
      worker.on("exit", resolve);
    });
  }

  const codes = await Promise.all(targets.map((target) => runWorker(target)));

  return codes.find((code) => code !== 0) || 0;
}
