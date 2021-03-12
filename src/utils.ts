import fs from "fs";
import ts from "typescript";
import { promisify } from "util";

const readFile = promisify(fs.readFile);

export function trimPrefix(input: string, prefix: string): string {
  if (input.startsWith(prefix)) {
    return input.substring(prefix.length);
  }

  return input;
}

export function trimSuffix(input: string, suffix: string): string {
  if (input.endsWith(suffix)) {
    return input.substring(0, input.length - suffix.length);
  }

  return input;
}

export async function readJSON(path: string): Promise<any> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}

export async function tryReadJSON(path: string): Promise<any> {
  try {
    return await readJSON(path);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export function mergeCustomTransformers(
  target: ts.CustomTransformers,
  source: ts.CustomTransformers
): ts.CustomTransformers {
  function merge<T>(target: T[] = [], source: T[] = []): T[] {
    return [...target, ...source];
  }

  return {
    before: merge(target.before, source.before),
    after: merge(target.after, source.after),
    afterDeclarations: merge(
      target.afterDeclarations,
      source.afterDeclarations
    ),
  };
}

export function isIncrementalCompilation(options: ts.CompilerOptions): boolean {
  return !!(options.incremental || options.composite);
}
