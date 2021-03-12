import type ts from "typescript";
import debug from "./debug";
import { createReporter, Reporter } from "../report";
import {
  mergeCustomTransformers,
  trimSuffix,
  isIncrementalCompilation,
} from "../utils";
import { createRewriteImportTransformer } from "../transformers/rewriteImport";
import { WorkerOptions } from "./types";
import { Target } from "../config";
import { extname } from "path";

const JS_EXT = ".js";
const MAP_EXT = ".map";
const JS_MAP_EXT = `${JS_EXT}${MAP_EXT}`;

type TS = typeof ts;

function loadCompiler(cwd: string, name = "typescript"): TS {
  const path = require.resolve(name, { paths: [cwd, __dirname] });
  return require(path);
}

export class Worker {
  private readonly ts: TS;
  private readonly system: ts.System;
  private readonly reporter: Reporter;
  private readonly extname?: string;
  private readonly target: Omit<Target, "extname">;
  private readonly options: Omit<WorkerOptions, "target">;

  constructor(data: WorkerOptions, system?: ts.System) {
    const { target, ...options } = data;
    const { extname, ...targetOptions } = target;

    this.target = targetOptions;
    this.extname = extname;
    this.options = options;
    this.ts = loadCompiler(data.cwd, data.compiler);
    this.system = system || this.ts.sys;
    this.reporter = createReporter({
      cwd: data.cwd,
      system: this.system,
      formatDiagnostics: this.ts.formatDiagnosticsWithColorAndContext,
      output: process.stderr,
      prefix: data.reportPrefix,
    });
  }

  public run(): number {
    const builder = this.createBuilder();

    if (this.options.clean) {
      return builder.clean();
    }

    return builder.build();
  }

  private getJSPath(path: string): string {
    if (!this.extname) return path;

    return trimSuffix(path, JS_EXT) + this.extname;
  }

  private getJSMapPath(path: string): string {
    if (!this.extname) return path;

    return trimSuffix(path, JS_MAP_EXT) + this.extname + MAP_EXT;
  }

  private rewritePath(path: string): string {
    if (path.endsWith(JS_EXT)) {
      return this.getJSPath(path);
    }

    if (path.endsWith(JS_MAP_EXT)) {
      return this.getJSMapPath(path);
    }

    return path;
  }

  private rewriteSourceMappingURL(data: string): string {
    return data.replace(
      /\/\/# sourceMappingURL=(.+)/g,
      (_, path) => `//# sourceMappingURL=${this.getJSMapPath(path)}`
    );
  }

  private rewriteSourceMap(data: string): string {
    const json = JSON.parse(data);
    json.file = this.getJSPath(json.file);
    return JSON.stringify(json);
  }

  private createBuilder() {
    const buildOptions: ts.BuildOptions = {
      verbose: this.options.verbose,
    };
    const createProgram = this.ts.createSemanticDiagnosticsBuilderProgram;

    if (this.options.watch) {
      const host = this.ts.createSolutionBuilderWithWatchHost(
        this.system,
        createProgram,
        this.reporter.reportDiagnostic,
        this.reporter.reportSolutionBuilderStatus,
        this.reporter.reportWatchStatus
      );
      this.patchSolutionBuilderHost(host);

      return this.ts.createSolutionBuilderWithWatch(
        host,
        this.options.projects,
        buildOptions
      );
    }

    const host = this.ts.createSolutionBuilderHost(
      this.system,
      createProgram,
      this.reporter.reportDiagnostic,
      this.reporter.reportSolutionBuilderStatus,
      this.reporter.reportErrorSummary
    );
    this.patchSolutionBuilderHost(host);

    return this.ts.createSolutionBuilder(
      host,
      this.options.projects,
      buildOptions
    );
  }

  private patchSolutionBuilderHost<T extends ts.BuilderProgram>(
    host: ts.SolutionBuilderHostBase<T>
  ) {
    const {
      writeFile,
      deleteFile,
      fileExists,
      readFile,
      createProgram,
      reportDiagnostic,
    } = host;

    const transformers: ts.CustomTransformers = {
      after: [
        createRewriteImportTransformer({
          extname: this.extname || JS_EXT,
          system: this.system,
        }),
      ],
    };

    const parseConfigFileHost: ts.ParseConfigFileHost = {
      ...this.system,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        reportDiagnostic?.(diagnostic);
      },
    };

    host.getParsedCommandLine = (path: string) => {
      const basePath = trimSuffix(path, extname(path));
      const { options } = this.ts.convertCompilerOptionsFromJson(
        this.target,
        path
      );

      const config = this.ts.getParsedCommandLineOfConfigFile(
        path,
        options,
        parseConfigFileHost
      );
      if (!config) return;

      // Set separated tsbuildinfo paths to avoid that multiple workers to
      // access the same tsbuildinfo files and potentially read/write corrupted
      // tsbuildinfo files
      if (
        this.extname &&
        !config.options.tsBuildInfoFile &&
        isIncrementalCompilation(config.options)
      ) {
        config.options.tsBuildInfoFile = `${basePath}${this.extname}.tsbuildinfo`;
      }

      return config;
    };

    host.createProgram = (...args) => {
      const program = createProgram(...args);
      const emit = program.emit;

      program.emit = (
        targetSourceFile,
        writeFile,
        cancellationToken,
        emitOnlyDtsFiles,
        customTransformers
      ) => {
        return emit(
          targetSourceFile,
          writeFile,
          cancellationToken,
          emitOnlyDtsFiles,
          mergeCustomTransformers(customTransformers || {}, transformers)
        );
      };

      return program;
    };

    host.fileExists = (path) => {
      return fileExists(this.rewritePath(path));
    };

    host.readFile = (path, encoding) => {
      return readFile(this.rewritePath(path), encoding);
    };

    host.writeFile = (path, data, writeByteOrderMark) => {
      const newPath = this.rewritePath(path);
      const newData = (() => {
        if (path.endsWith(JS_EXT)) {
          return this.rewriteSourceMappingURL(data);
        }

        if (path.endsWith(JS_MAP_EXT)) {
          return this.rewriteSourceMap(data);
        }

        return data;
      })();

      debug("Write file: %s", newPath);
      writeFile?.(newPath, newData, writeByteOrderMark);
    };

    host.deleteFile = (path) => {
      const newPath = this.rewritePath(path);
      debug("Delete file: %s", newPath);
      deleteFile?.(newPath);
    };
  }
}
