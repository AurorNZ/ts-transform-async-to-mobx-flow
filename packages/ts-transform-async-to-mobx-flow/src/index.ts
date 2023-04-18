import ts from 'typescript';

export interface Options {
  mobxPackage: string;
}

const transformToMobxFlow = 'transformToMobxFlow';

/** ts-jest calls this method for their astTransformers */
export function factory() {
  return createTransformer();
}

// ts-jest config
export const name = 'ts-transform-async-to-mobx-flow';
// ts-jest config: increment this each time the code is modified
export const version = 1;

/**
 * 1. Look for functions marked as @transformToMobxFlow or transformToMobxFlow(...)
 * 2. Transform them to generator functions wrapped into mobx.flow
 * 3. Adds import to mobx.flow if there's anything transformed
 */
export default function createTransformer({
  mobxPackage = 'mobx',
}: Partial<Options> = {}): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (file) => visitSourceFile(mobxPackage, file, context);
}

function visitSourceFile(
  mobxPackage: string,
  source: ts.SourceFile,
  context: ts.TransformationContext,
): ts.SourceFile {
  const mobxNamespaceImport = ts.factory.createUniqueName(
    'mobx',
    ts.GeneratedIdentifierFlags.Optimistic | ts.GeneratedIdentifierFlags.FileLevel,
  );
  const flowExpression = ts.factory.createPropertyAccessExpression(
    mobxNamespaceImport,
    ts.factory.createIdentifier('flow'),
  );
  let transformed = false;

  const sourceWithMobxImport = addImportMobxStatement(source, mobxPackage, mobxNamespaceImport);

  const visitor: ts.Visitor = (node) => {
    if (checkTransformToMobxFlowCallExpression(node)) {
      const fn = node.arguments[0];

      if (!isAsyncFunction(fn)) {
        throw new Error(
          errorMessage(`Could not resolve expression as async function: ${node.getFullText()}`),
        );
      }

      if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
        transformed = true;

        const name = resolveFunctionName(node, fn);
        const newFunctionBlock = createNewFunctionBlock(
          flowExpression,
          name,
          ts.visitEachChild(fn.body, visitor, context),
          context,
        );

        return transformFunction(fn, newFunctionBlock);
      }
    }

    if (ts.isMethodDeclaration(node) && hasTransformToMobxFlowDecorators(node) && node.body) {
      if (!isAsyncFunction(node)) {
        throw new Error(
          errorMessage(`Could not resolve expression as async function: ${node.getFullText()}`),
        );
      }

      transformed = true;

      const newFunctionBlock = createNewFunctionBlock(
        flowExpression,
        ts.isIdentifier(node.name) ? node.name : undefined,
        ts.visitEachChild(node.body, visitor, context),
        context,
      );

      return transformMethodDeclaration(node, newFunctionBlock);
    }

    if (
      ts.isPropertyDeclaration(node) &&
      hasTransformToMobxFlowDecorators(node) &&
      node.initializer
    ) {
      const fn = node.initializer;

      if (!isAsyncFunction(fn)) {
        throw new Error(
          errorMessage(`Could not resolve expression as async function: ${node.getFullText()}`),
        );
      }

      if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
        transformed = true;
        const newFunctionBlock = createNewFunctionBlock(
          flowExpression,
          ts.isIdentifier(node.name) ? node.name : undefined,
          ts.visitEachChild(fn.body, visitor, context),
          context,
        );

        return transformPropertyDeclaration(node, transformFunction(fn, newFunctionBlock));
      }
    }

    return ts.visitEachChild(node, visitor, context);
  };

  const convertToFlowResult = ts.visitEachChild(sourceWithMobxImport, visitor, context);

  if (transformed) {
    return convertToFlowResult;
  }

  return source;
}

function createNewFunctionBlock(
  flowIdentifier: ts.Expression,
  name: ts.Identifier | undefined,
  body: ts.ConciseBody,
  context: ts.TransformationContext,
) {
  const replaceYieldAndCheckNested: ts.Visitor = (node) => {
    if (ts.isAwaitExpression(node)) {
      return ts.factory.createYieldExpression(undefined, node.expression);
    } else if (ts.isFunctionLike(node)) {
      // do not visit nested functions
      return node;
    }

    return ts.visitEachChild(node, replaceYieldAndCheckNested, context);
  };

  const convertedBody = replaceYieldAndCheckNested(body) as ts.ConciseBody;

  return createWrappedFunctionBlock(flowIdentifier, name, convertedBody);
}

/**
 * adds `import * as mobx_1 from 'mobx';`
 * It is possible to try to reuse and existing import statement, but adding one seems simpler for now
 */
function addImportMobxStatement(
  source: ts.SourceFile,
  mobxPackage: string,
  mobxNamespaceImport: ts.Identifier,
) {
  let importFlowStatement: ts.ImportDeclaration;
  if (typescript_4_7_or_lower()) {
    importFlowStatement = (ts.factory as any).createImportDeclaration(
      undefined,
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(mobxNamespaceImport),
      ),
      ts.factory.createStringLiteral(mobxPackage),
    );
  } else {
    importFlowStatement = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(mobxNamespaceImport),
      ),
      ts.factory.createStringLiteral(mobxPackage),
    );
  }

  return ts.factory.updateSourceFile(
    source,
    [importFlowStatement, ...source.statements],
    source.isDeclarationFile,
    source.referencedFiles,
    source.typeReferenceDirectives,
    source.hasNoDefaultLib,
    source.libReferenceDirectives,
  );
}

/**
 *  Checks whether the node is a method call wrapped into transformToMobxFlow method
 * @example
```
const a = transfromToMobxFlow(async (input) => {
  await this.delay(this.input)
});
// or
const b = transfromToMobxFlow(async function (input) {
  await this.delay(this.input)
});
```
 */
function checkTransformToMobxFlowCallExpression(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === transformToMobxFlow
  );
}

/**
 * A helper to update function and strip the async keyword from modifiers
 */
function transformFunction(
  fn: ts.FunctionExpression | ts.ArrowFunction,
  newFunctionBlock: ts.Block,
) {
  if (ts.isArrowFunction(fn)) {
    return ts.factory.updateArrowFunction(
      fn,
      // @ts-expect-error
      filterOutAsyncModifierAndTransformToMobxFlow(fn.modifiers),
      fn.typeParameters,
      fn.parameters,
      fn.type,
      fn.equalsGreaterThanToken,
      newFunctionBlock,
    );
  } else {
    return ts.factory.updateFunctionExpression(
      fn,
      // @ts-expect-error
      filterOutAsyncModifierAndTransformToMobxFlow(fn.modifiers),
      undefined,
      fn.name,
      fn.typeParameters,
      fn.parameters,
      fn.type,
      newFunctionBlock,
    );
  }
}

/**
 * A helper to update method declaration and strip the async keyword from modifiers
 */
function transformMethodDeclaration(node: ts.MethodDeclaration, newFunctionBlock: ts.Block) {
  const newModifiers = filterOutAsyncModifierAndTransformToMobxFlow(
    (node.modifiers ?? []).concat((node as any).decorators ?? []),
  );

  if (typescript_4_7_or_lower()) {
    return (ts.factory as any).updateMethodDeclaration(
      node,
      newModifiers?.filter((x) => ts.isDecorator(x)),
      newModifiers?.filter((x) => ts.isModifier(x)),
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      newFunctionBlock,
    );
  } else {
    return ts.factory.updateMethodDeclaration(
      node,
      newModifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      newFunctionBlock,
    );
  }
}

/**
 * A helper to update property declaration and strip the async keyword from modifiers
 */
function transformPropertyDeclaration(
  node: ts.PropertyDeclaration,
  newFunctionBlock: ts.ArrowFunction | ts.FunctionExpression,
) {
  const newModifiers = filterOutAsyncModifierAndTransformToMobxFlow(
    (node.modifiers ?? []).concat((node as any).decorators ?? []),
  );

  if (typescript_4_7_or_lower()) {
    return (ts.factory as any).updatePropertyDeclaration(
      node,
      newModifiers?.filter((x) => ts.isDecorator(x)),
      newModifiers?.filter((x) => ts.isModifier(x)),
      node.name,
      node.questionToken,
      node.type,
      newFunctionBlock,
    );
  } else {
    return ts.factory.updatePropertyDeclaration(
      node,
      newModifiers,
      node.name,
      node.questionToken,
      node.type,
      newFunctionBlock,
    );
  }
}

/**
 * creating a function block, eg
 * @example
 ```ts
// in:
await this.delay(this.input)

// out:
return flow_1(function*() {
  yield this.delay(this.input)
}).call(this);
```
 */
function createWrappedFunctionBlock(
  flowExpression: ts.Expression,
  name: ts.Identifier | undefined,
  convertedBody: ts.ConciseBody,
) {
  return ts.factory.createBlock([
    ts.factory.createReturnStatement(
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createCallExpression(flowExpression, undefined, [
            ts.factory.createFunctionExpression(
              undefined,
              ts.factory.createToken(ts.SyntaxKind.AsteriskToken),
              name
                ? ts.factory.createUniqueName(
                    `${name.text}_mobxFlow`,
                    ts.GeneratedIdentifierFlags.Optimistic,
                  )
                : undefined,
              undefined,
              undefined,
              undefined,
              ts.isBlock(convertedBody)
                ? convertedBody
                : ts.factory.createBlock([ts.factory.createExpressionStatement(convertedBody)]),
            ),
          ]),
          'call',
        ),
        undefined,
        [ts.factory.createThis()],
      ),
    ),
  ]);
}

/**
 * try to resolve arrow function name from variable declaration, eg:
 * @example
 ```ts
// in:
const fn = transformToMobxFlow(async (input) => {
  await this.delay(this.input)
})
// out:
const fn = (input) => {
  return flow_1(function* fn() { // notice the function name is set here
    yield this.delay(this.input)
  }).call(this);
} 
```
 */
function resolveFunctionName(node: ts.Node, fn: ts.FunctionExpression | ts.ArrowFunction) {
  let name = fn.name;

  if (
    !fn.name &&
    node.parent &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    name = node.parent.name;
  }
  return name;
}

function hasTransformToMobxFlowDecorators(node: ts.MethodDeclaration | ts.PropertyDeclaration) {
  const modifiers = (node.modifiers ?? []).concat((node as any).decorators ?? []);
  if (
    modifiers &&
    modifiers.filter(
      (x) =>
        ts.isDecorator(x) &&
        ts.isIdentifier(x.expression) &&
        x.expression.text === transformToMobxFlow,
    ).length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Returns all the modifiers except for `async` and @transformToMobxFlow decorator
 * Ensures to return undefined if the array is empty
 */
function filterOutAsyncModifierAndTransformToMobxFlow(
  modifiers: ts.ModifierLike[] | undefined,
): ts.ModifierLike[] | undefined {
  return (
    modifiers &&
    modifiers.reduce<ts.ModifierLike[] | undefined>((acc, x) => {
      // skip async modifier
      if (x.kind === ts.SyntaxKind.AsyncKeyword) {
        return acc;
      }

      // skip @transformToMobxFlow decorator
      if (
        ts.isDecorator(x) &&
        ts.isIdentifier(x.expression) &&
        x.expression.text === transformToMobxFlow
      ) {
        return acc;
      }

      return acc ? [...acc, x] : [x];
    }, undefined)
  );
}

function isAsyncFunction(node: ts.Node): boolean {
  return (ts as any).isAsyncFunction(node);
}

function errorMessage(message: string): string {
  return `[ts-transform-async-to-mobx-flow]: ${message}`;
}

/** Returns true when Typescript version is 4.7 or lower, version 4.8 had breaking api changes merging modifiers and decorators  */
function typescript_4_7_or_lower() {
  const [majorString, minorString] = ts.versionMajorMinor.split('.');

  const major = parseInt(majorString);
  const minor = parseInt(minorString);

  return major < 4 || (major === 4 && minor <= 7);
}
