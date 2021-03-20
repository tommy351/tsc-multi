import { resolve, dirname, extname } from "path";
import ts from "typescript";
import { trimSuffix } from "../utils";

const JS_EXT = ".js";

function isRelativePath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

export interface RewriteImportTransformerOptions {
  extname: string;
  system: ts.System;
}

export function createRewriteImportTransformer(
  options: RewriteImportTransformerOptions
): ts.TransformerFactory<ts.SourceFile> {
  function isDirectory(sourceFile: ts.SourceFile, path: string): boolean {
    const sourcePath = sourceFile.fileName;
    const fullPath = resolve(dirname(sourcePath), path);

    return options.system.directoryExists(fullPath);
  }

  function updateModuleSpecifier(
    sourceFile: ts.SourceFile,
    node: ts.Expression
  ): ts.Expression {
    if (!ts.isStringLiteral(node) || !isRelativePath(node.text)) return node;

    if (isDirectory(sourceFile, node.text)) {
      return ts.factory.createStringLiteral(
        `${node.text}/index${options.extname}`
      );
    }

    const ext = extname(node.text);
    const base = ext === JS_EXT ? trimSuffix(node.text, JS_EXT) : node.text;

    return ts.factory.createStringLiteral(`${base}${options.extname}`);
  }

  return (ctx) => {
    let sourceFile: ts.SourceFile;

    const visitor: ts.Visitor = (node) => {
      // ESM import
      if (ts.isImportDeclaration(node)) {
        return ts.factory.createImportDeclaration(
          node.decorators,
          node.modifiers,
          node.importClause,
          updateModuleSpecifier(sourceFile, node.moduleSpecifier)
        );
      }

      // ESM export
      if (ts.isExportDeclaration(node)) {
        if (!node.moduleSpecifier) return node;

        return ts.factory.createExportDeclaration(
          node.decorators,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          updateModuleSpecifier(sourceFile, node.moduleSpecifier)
        );
      }

      // ESM dynamic import
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const [firstArg, ...restArg] = node.arguments;
        if (!firstArg) return node;

        return ts.factory.createCallExpression(
          node.expression,
          node.typeArguments,
          [updateModuleSpecifier(sourceFile, firstArg), ...restArg]
        );
      }

      // CommonJS require
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.escapedText === "require"
      ) {
        const [firstArg, ...restArgs] = node.arguments;
        if (!firstArg) return node;

        return ts.factory.createCallExpression(
          node.expression,
          node.typeArguments,
          [updateModuleSpecifier(sourceFile, firstArg), ...restArgs]
        );
      }

      return ts.visitEachChild(node, visitor, ctx);
    };

    return (file) => {
      sourceFile = file;
      return ts.visitNode(file, visitor);
    };
  };
}
