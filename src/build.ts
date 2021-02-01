import { join, resolve } from "path";
import ts from "typescript";
import { Worker } from "worker_threads";
import { BaseBuildOptions, Target } from "./types";
import { WorkerData } from "./worker";

export interface BuildOptions extends BaseBuildOptions {
  projects: string[];
  targets: Target[];
  cwd?: string;
}

export async function build({
  cwd = process.cwd(),
  projects = [],
  targets = [],
  ...options
}: BuildOptions): Promise<number> {
  if (!projects.length) {
    throw new Error("At least one project is required");
  }

  if (!targets.length) {
    throw new Error("At least one targets is required");
  }

  const rootNames = projects.map((path) => {
    const searchPath = resolve(cwd, path);
    return ts.findConfigFile(searchPath, ts.sys.fileExists) || searchPath;
  });

  function runWorker(target: Target): Promise<number> {
    return new Promise((resolve, reject) => {
      const data: WorkerData = {
        rootNames,
        target,
        ...options,
      };

      const worker = new Worker(join(__dirname, "worker.js"), {
        workerData: data,
      });

      worker.on("error", reject);
      worker.on("exit", resolve);
    });
  }

  const codes = await Promise.all(targets.map((target) => runWorker(target)));

  return codes.find((code) => code !== 0) || 0;
}
