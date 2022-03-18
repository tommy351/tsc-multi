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
import { dirname, extname, join } from "path";

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

  constructor(private readonly data: WorkerOptions, system?: ts.System) {
    this.ts = loadCompiler(data.cwd, data.compiler);
    this.system = this.createSystem(system || this.ts.sys);
    this.reporter = createReporter({
      cwd: data.cwd,
      system: this.system,
      formatDiagnostics: this.ts.formatDiagnosticsWithColorAndContext,
      output: process.stderr,
      prefix: data.reportPrefix,
    });
  }

  public run(): number {
    if (this.data.transpileOnly) {
      this.transpile();
      return 0;
    }

    const builder = this.createBuilder();

    if (this.data.clean) {
      return builder.clean();
    }

    return builder.build();
  }

  private getJSPath(path: string): string {
    if (!this.data.extname) return path;

    return trimSuffix(path, JS_EXT) + this.data.extname;
  }

  private getJSMapPath(path: string): string {
    if (!this.data.extname) return path;

    return trimSuffix(path, JS_MAP_EXT) + this.data.extname + MAP_EXT;
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

  private createSystem(sys: Readonly<ts.System>): ts.System {
    const getReadPaths = (path: string) => {
      const paths = [this.rewritePath(path)];

      // Source files may be .js files when `allowJs` is enabled. When a .js
      // file with rewritten path doesn't exist, retry again without rewriting
      // the path.
      if (path.endsWith(JS_EXT)) {
        paths.push(path);
      }

      return paths;
    };

    return {
      ...sys,
      fileExists: (inputPath) => {
        return getReadPaths(inputPath).reduce<boolean>(
          (result, path) => result || sys.fileExists(path),
          false
        );
      },
      readFile: (inputPath, encoding) => {
        return (
          getReadPaths(inputPath).reduce<string | undefined | null>(
            (result, path) => result ?? sys.readFile(path, encoding),
            null
          ) ?? undefined
        );
      },
      writeFile: (path, data, writeByteOrderMark) => {
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
        sys.writeFile(newPath, newData, writeByteOrderMark);
      },
      deleteFile: (path) => {
        const newPath = this.rewritePath(path);
        debug("Delete file: %s", newPath);
        sys.deleteFile?.(newPath);
      },
    };
  }

  private createBuilder() {
    const buildOptions: ts.BuildOptions = {
      verbose: this.data.verbose,
      dry: this.data.dry,
      force: this.data.force,
    };
    const createProgram = this.ts.createSemanticDiagnosticsBuilderProgram;

    if (this.data.watch) {
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
        this.data.projects,
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
      this.data.projects,
      buildOptions
    );
  }

  private patchSolutionBuilderHost<T extends ts.BuilderProgram>(
    host: ts.SolutionBuilderHostBase<T>
  ) {
    const { createProgram, reportDiagnostic } = host;

    const transformers: ts.CustomTransformers = {
      after: [
        createRewriteImportTransformer({
          extname: this.data.extname || JS_EXT,
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
        this.data.target,
        dirname(path),
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
        this.data.extname &&
        !config.options.tsBuildInfoFile &&
        isIncrementalCompilation(config.options)
      ) {
        config.options.tsBuildInfoFile = `${basePath}${this.data.extname}.tsbuildinfo`;
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
  }

  private transpile() {
    for (const project of this.data.projects) {
      this.transpileProject(project);
    }
  }

  private transpileProject(projectPath: string) {
    // TODO: Detect tsconfig.json path
    const tsConfigPath = join(projectPath, "tsconfig.json");
    const { options } = this.ts.convertCompilerOptionsFromJson(
      this.data.target,
      projectPath,
      tsConfigPath
    );
    const parseConfigFileHost: ts.ParseConfigFileHost = {
      ...this.system,
      onUnRecoverableConfigFileDiagnostic: this.reporter.reportDiagnostic,
    };

    const config = this.ts.getParsedCommandLineOfConfigFile(
      tsConfigPath,
      options,
      parseConfigFileHost
    );
    if (!config) return;

    // TODO: Merge custom transformers
    const transformers: ts.CustomTransformers = {
      after: [
        createRewriteImportTransformer({
          extname: this.data.extname || JS_EXT,
          system: this.system,
        }),
      ],
    };

    for (const inputPath of config.fileNames) {
      if (!this.system.fileExists(inputPath)) continue;

      const content = this.system.readFile(inputPath) || "";
      const [outputPath, sourceMapPath] = this.ts.getOutputFileNames(
        config,
        inputPath,
        false
      );
      const output = this.ts.transpileModule(content, {
        compilerOptions: config.options,
        fileName: inputPath,
        transformers,
      });

      for (const diag of output.diagnostics ?? []) {
        this.reporter.reportDiagnostic(diag);
      }

      this.system.writeFile(outputPath, output.outputText);

      if (typeof output.sourceMapText === "string") {
        this.system.writeFile(sourceMapPath, output.sourceMapText);
      }
    }
  }
}
