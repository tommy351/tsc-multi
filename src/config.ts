import { resolve } from "path";
import {
  object,
  string,
  array,
  boolean,
  size,
  optional,
  Infer,
  validate,
} from "superstruct";
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
  verbose: optional(boolean()),
  projects: size(array(string()), 1, Infinity),
  targets: size(array(targetSchema), 1, Infinity),
});

export type Config = Infer<typeof configSchema> & {
  cwd: string;
};

export interface LoadConfigOptions {
  cwd?: string;
  path?: string;
  extras?: Partial<Config>;
}

export async function loadConfig({
  cwd = process.cwd(),
  path = "tsc-multi.json",
  extras,
}: LoadConfigOptions): Promise<Config> {
  const configPath = resolve(cwd, path);

  debug("Read config from %s", configPath);

  const json = {
    ...(await tryReadJSON(configPath)),
    ...extras,
  };
  const result = validate(json, configSchema);

  if (result[0]) {
    throw result[0];
  }

  const config = result[1];

  return {
    ...config,
    cwd,
    projects: config.projects.map((path) => resolve(cwd, path)),
  };
}
