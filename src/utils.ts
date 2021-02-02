import { readJSON } from "fs-extra";
import ts from "typescript";

export function trimSuffix(input: string, suffix: string): string {
  if (input.endsWith(suffix)) {
    return input.substring(0, input.length - suffix.length);
  }

  return input;
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
