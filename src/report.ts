import type ts from "typescript";

export interface Reporter {
  formatDiagnosticsHost: ts.FormatDiagnosticsHost;
  reportDiagnostic: ts.DiagnosticReporter;
  reportSolutionBuilderStatus: ts.DiagnosticReporter;
  reportErrorSummary: ts.ReportEmitErrorSummary;
  reportWatchStatus: ts.WatchStatusReporter;
}

export default function createReporter(
  cwd: string,
  { sys, formatDiagnosticsWithColorAndContext }: typeof ts
): Reporter {
  const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => cwd,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => sys.newLine,
  };

  function reportDiagnostic(diagnostic: ts.Diagnostic): void {
    const output = formatDiagnosticsWithColorAndContext(
      [diagnostic],
      formatDiagnosticsHost
    );
    process.stderr.write(output);
  }

  function reportErrorSummary(errorCount: number): void {
    process.stderr.write(
      `Found ${errorCount} ${errorCount === 1 ? "error" : "errors"}.\n`
    );
  }

  function reportWatchStatus(diagnostic: ts.Diagnostic, newLine: string) {
    const output = formatDiagnosticsWithColorAndContext([diagnostic], {
      ...formatDiagnosticsHost,
      getNewLine: () => newLine,
    });

    process.stderr.write(output);
  }

  return {
    formatDiagnosticsHost,
    reportDiagnostic,
    reportSolutionBuilderStatus: reportDiagnostic,
    reportErrorSummary,
    reportWatchStatus,
  };
}
