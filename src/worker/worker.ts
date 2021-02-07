import ts from "typescript";
import debug from "./debug";
import {
  reportDiagnostic,
  reportErrorSummary,
  reportSolutionBuilderStatus,
  reportWatchStatus,
} from "../report";
import omit from "lodash.omit";
import { mergeCustomTransformers, trimSuffix } from "../utils";
import { createRewriteImportTransformer } from "../transformers/rewriteImport";
import { WorkerOptions } from "./types";

const JS_EXT = ".js";
const MAP_EXT = ".map";
const JS_MAP_EXT = `${JS_EXT}${MAP_EXT}`;

export class Worker {
  constructor(
    private readonly data: WorkerOptions,
    private readonly system: ts.System = ts.sys
  ) {}

  public run(): number {
    const builder = this.createBuilder();

    if (this.data.clean) {
      return builder.clean();
    }

    return builder.build();
  }

  private getJSPath(path: string): string {
    const { extname } = this.data.target;
    if (!extname) return path;

    return trimSuffix(path, JS_EXT) + extname;
  }

  private getJSMapPath(path: string): string {
    const { extname } = this.data.target;
    if (!extname) return path;

    return trimSuffix(path, JS_MAP_EXT) + extname + MAP_EXT;
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
      verbose: this.data.verbose,
    };
    const createProgram = ts.createSemanticDiagnosticsBuilderProgram;

    if (this.data.watch) {
      const host = ts.createSolutionBuilderWithWatchHost(
        this.system,
        createProgram,
        reportDiagnostic,
        reportSolutionBuilderStatus,
        reportWatchStatus
      );
      this.patchSolutionBuilderHost(host);

      return ts.createSolutionBuilderWithWatch(
        host,
        this.data.projects,
        buildOptions
      );
    }
    const host = ts.createSolutionBuilderHost(
      this.system,
      createProgram,
      reportDiagnostic,
      reportSolutionBuilderStatus,
      reportErrorSummary
    );
    this.patchSolutionBuilderHost(host);

    return ts.createSolutionBuilder(host, this.data.projects, buildOptions);
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
          extname: this.data.target.extname || JS_EXT,
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
      const { options } = ts.convertCompilerOptionsFromJson(
        omit(this.data.target, ["extname"]),
        path
      );

      const config = ts.getParsedCommandLineOfConfigFile(
        path,
        options,
        parseConfigFileHost
      );

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
