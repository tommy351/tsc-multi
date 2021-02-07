import { extname, posix } from "path";
import ts from "typescript";

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
    const fullPath = posix.resolve(posix.dirname(sourcePath), path);

    return options.system.directoryExists(fullPath);
  }

  function updateModuleSpecifier(
    sourceFile: ts.SourceFile,
    node: ts.Expression
  ): ts.Expression {
    if (!ts.isStringLiteral(node)) return node;

    if (isRelativePath(node.text) && !extname(node.text)) {
      if (isDirectory(sourceFile, node.text)) {
        return ts.factory.createStringLiteral(
          `${node.text}/index${options.extname}`
        );
      }

      return ts.factory.createStringLiteral(`${node.text}${options.extname}`);
    }

    return node;
  }

  return (ctx) => {
    let sourceFile: ts.SourceFile;

    const visitor: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node)) {
        return ts.factory.createImportDeclaration(
          node.decorators,
          node.modifiers,
          node.importClause,
          updateModuleSpecifier(sourceFile, node.moduleSpecifier)
        );
      }

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
