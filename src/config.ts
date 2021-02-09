import { dirname, resolve } from "path";
import { object, string, array, Infer, validate, optional } from "superstruct";
import Debug from "./debug";
import { tryReadJSON } from "./utils";

const debug = Debug.extend("config");

const targetSchema = object({
  extname: optional(string()),
  module: optional(string()),
  target: optional(string()),
});

export type Target = Infer<typeof targetSchema>;

const configSchema = object({
  projects: optional(array(string())),
  targets: optional(array(targetSchema)),
  compiler: optional(string()),
});

export type InferConfig = Infer<typeof configSchema>;

export type Config = InferConfig & {
  cwd: string;
  projects: string[];
  targets: Target[];
};

export interface LoadConfigOptions {
  cwd?: string;
  path?: string;
}

export async function loadConfig({
  cwd = process.cwd(),
  path = "tsc-multi.json",
}: LoadConfigOptions): Promise<Config> {
  const configPath = resolve(cwd, path);

  debug("Read config from %s", configPath);

  const json = await tryReadJSON(configPath);
  const result = validate(json, configSchema);

  if (result[0]) {
    throw result[0];
  }

  const configDir = dirname(configPath);
  const config = result[1];

  return {
    ...config,
    cwd,
    projects: (config.projects || []).map((path) => resolve(configDir, path)),
    targets: config.targets || [],
  };
}
