import { Target } from "../config";

export interface WorkerOptions {
  target: Omit<Target, "extname">;
  extname?: string;
  packageOverrides?: Record<
    string,
    Record<string, unknown> & { type?: "commonjs" | "module" }
  >;
  verbose?: boolean;
  dry?: boolean;
  force?: boolean;
  watch?: boolean;
  clean?: boolean;
  projects: string[];
  cwd: string;
  compiler?: string;
  reportPrefix?: string;
  transpileOnly?: boolean;
}
