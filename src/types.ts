import ts from "typescript";

export interface Target extends ts.CompilerOptions {
  extname?: string;
}

export interface BaseBuildOptions {
  watch?: boolean;
  clean?: boolean;
  verbose?: boolean;
}
