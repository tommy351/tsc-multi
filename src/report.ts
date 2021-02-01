import ts from "typescript";

export const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: process.cwd,
  getCanonicalFileName: (fileName) => fileName,
  getNewLine: () => ts.sys.newLine,
};

export function reportDiagnostic(diagnostic: ts.Diagnostic): void {
  const output = ts.formatDiagnosticsWithColorAndContext(
    [diagnostic],
    formatDiagnosticsHost
  );
  process.stderr.write(output);
}

export function reportSolutionBuilderStatus(diagnostic: ts.Diagnostic): void {
  reportDiagnostic(diagnostic);
}

export function reportErrorSummary(errorCount: number): void {
  process.stderr.write(
    `Found ${errorCount} ${errorCount === 1 ? "error" : "errors"}.\n`
  );
}

export function reportWatchStatus(
  diagnostic: ts.Diagnostic,
  newLine: string
): void {
  const output = ts.formatDiagnosticsWithColorAndContext([diagnostic], {
    ...formatDiagnosticsHost,
    getNewLine: () => newLine,
  });

  process.stderr.write(output);
}
