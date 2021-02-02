import { extname } from "path";
import ts from "typescript";

function isRelativePath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

export interface RewriteImportTransformerOptions {
  extname: string;
}

export function createRewriteImportTransformer(
  options: RewriteImportTransformerOptions
): ts.TransformerFactory<ts.SourceFile> {
  function updateModuleSpecifier(node: ts.Expression): ts.Expression {
    if (!ts.isStringLiteral(node)) return node;

    if (isRelativePath(node.text) && !extname(node.text)) {
      return ts.factory.createStringLiteral(`${node.text}${options.extname}`);
    }

    return node;
  }

  return (ctx) => {
    const visitor: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node)) {
        return ts.factory.createImportDeclaration(
          node.decorators,
          node.modifiers,
          node.importClause,
          updateModuleSpecifier(node.moduleSpecifier)
        );
      }

      if (ts.isExportDeclaration(node)) {
        if (!node.moduleSpecifier) return node;

        return ts.factory.createExportDeclaration(
          node.decorators,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          updateModuleSpecifier(node.moduleSpecifier)
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
          [updateModuleSpecifier(firstArg), ...restArgs]
        );
      }

      return ts.visitEachChild(node, visitor, ctx);
    };

    return (sourceFile) => {
      return ts.visitNode(sourceFile, visitor);
    };
  };
}
