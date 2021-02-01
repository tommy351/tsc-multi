import ts from "typescript";
import wt from "worker_threads";
import {
  reportDiagnostic,
  reportErrorSummary,
  reportSolutionBuilderStatus,
  reportWatchStatus,
} from "./report";
import { BaseBuildOptions, Target } from "./types";
import omit from "lodash.omit";
import { trimSuffix } from "./path";

const JS_EXT = ".js";
const MAP_EXT = ".map";
const JS_MAP_EXT = `${JS_EXT}${MAP_EXT}`;

export interface WorkerData extends BaseBuildOptions {
  rootNames: string[];
  target: Target;
}

const workerData: WorkerData = wt.workerData;

const parseConfigFileHost: ts.ParseConfigFileHost = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic() {
    // do nothing
  },
};

function getJSPath(path: string): string {
  const { extname } = workerData.target;
  if (!extname) return path;

  return trimSuffix(path, JS_EXT) + extname;
}

function getJSMapPath(path: string): string {
  const { extname } = workerData.target;
  if (!extname) return path;

  return trimSuffix(path, JS_MAP_EXT) + extname + MAP_EXT;
}

function rewritePath(path: string): string {
  if (path.endsWith(JS_EXT)) {
    return getJSPath(path);
  }

  if (path.endsWith(JS_MAP_EXT)) {
    return getJSMapPath(path);
  }

  return path;
}

function rewriteSourceMappingURL(data: string): string {
  return data.replace(
    /\/\/# sourceMappingURL=(.+)/g,
    (_, path) => `//# sourceMappingURL=${getJSMapPath(path)}`
  );
}

function rewriteSourceMap(data: string): string {
  const json = JSON.parse(data);
  json.file = getJSPath(json.file);
  return JSON.stringify(json);
}

function patchSolutionBuilderHost<T extends ts.BuilderProgram>(
  host: ts.SolutionBuilderHostBase<T>
) {
  const {
    writeFile = ts.sys.writeFile,
    deleteFile,
    fileExists,
    readFile,
  } = host;

  host.getParsedCommandLine = (path: string) => {
    const { options } = ts.convertCompilerOptionsFromJson(
      omit(workerData.target, ["extname"]),
      path
    );

    const config = ts.getParsedCommandLineOfConfigFile(
      path,
      options,
      parseConfigFileHost
    );

    return config;
  };

  host.fileExists = (path) => {
    return fileExists(rewritePath(path));
  };

  host.readFile = (path, encoding) => {
    return readFile(rewritePath(path), encoding);
  };

  host.writeFile = (path, data, writeByteOrderMark) => {
    if (path.endsWith(JS_EXT)) {
      writeFile(
        getJSPath(path),
        rewriteSourceMappingURL(data),
        writeByteOrderMark
      );
    } else if (path.endsWith(JS_MAP_EXT)) {
      writeFile(getJSMapPath(path), rewriteSourceMap(data), writeByteOrderMark);
    } else {
      writeFile(path, data, writeByteOrderMark);
    }
  };

  host.deleteFile = (path) => {
    deleteFile?.(rewritePath(path));
  };
}

const builder = (() => {
  const buildOptions: ts.BuildOptions = {
    verbose: workerData.verbose,
  };
  const createProgram = ts.createSemanticDiagnosticsBuilderProgram;

  if (workerData.watch) {
    const host = ts.createSolutionBuilderWithWatchHost(
      ts.sys,
      createProgram,
      reportDiagnostic,
      reportSolutionBuilderStatus,
      reportWatchStatus
    );
    patchSolutionBuilderHost(host);

    return ts.createSolutionBuilderWithWatch(
      host,
      workerData.rootNames,
      buildOptions
    );
  }
  const host = ts.createSolutionBuilderHost(
    ts.sys,
    createProgram,
    reportDiagnostic,
    reportSolutionBuilderStatus,
    reportErrorSummary
  );
  patchSolutionBuilderHost(host);

  return ts.createSolutionBuilder(host, workerData.rootNames, buildOptions);
})();

const exitCode = workerData.clean ? builder.clean() : builder.build();
process.exitCode = exitCode;
