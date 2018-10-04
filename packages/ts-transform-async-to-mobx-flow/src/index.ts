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
  return context => file => visitSourceFile(mobxPackage, file, context);
}

function visitSourceFile(
  mobxPackage: string,
  source: ts.SourceFile,
  context: ts.TransformationContext,
): ts.SourceFile {
  const mobxNamespaceImport = ts.createFileLevelUniqueName('mobx');
  const flowExpression = ts.createPropertyAccess(mobxNamespaceImport, ts.createIdentifier('flow'));
  let transformed = false;

  const sourceWithMobxImport = addImportMobxStatement(source, mobxPackage, mobxNamespaceImport);

  const visitor: ts.Visitor = node => {
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

    if (
      ts.isMethodDeclaration(node) &&
      hasTransformToMobxFlowDecorators(node.decorators) &&
      node.body
    ) {
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
      hasTransformToMobxFlowDecorators(node.decorators) &&
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
  const replaceYieldAndCheckNested: ts.Visitor = node => {
    if (ts.isAwaitExpression(node)) {
      return ts.createYield(node.expression);
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
  const importFlowStatement = ts.createImportDeclaration(
    undefined,
    undefined,
    ts.createImportClause(undefined, ts.createNamespaceImport(mobxNamespaceImport)),
    ts.createLiteral(mobxPackage),
  );
  return ts.updateSourceFileNode(
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
    return ts.updateArrowFunction(
      fn,
      filterOutAsyncModifier(fn.modifiers),
      fn.typeParameters,
      fn.parameters,
      fn.type,
      fn.equalsGreaterThanToken,
      newFunctionBlock,
    );
  } else {
    return ts.updateFunctionExpression(
      fn,
      filterOutAsyncModifier(fn.modifiers),
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
  const otherDecorators = filterOutTransformToMobxFlowDecorators(node.decorators);

  return ts.updateMethod(
    node,
    otherDecorators,
    filterOutAsyncModifier(node.modifiers),
    node.asteriskToken,
    node.name,
    node.questionToken,
    node.typeParameters,
    node.parameters,
    node.type,
    newFunctionBlock,
  );
}

/**
 * A helper to update property declaration and strip the async keyword from modifiers
 */
function transformPropertyDeclaration(
  node: ts.PropertyDeclaration,
  newFunctionBlock: ts.ArrowFunction | ts.FunctionExpression,
) {
  const otherDecorators = filterOutTransformToMobxFlowDecorators(node.decorators);

  return ts.updateProperty(
    node,
    otherDecorators,
    filterOutAsyncModifier(node.modifiers),
    node.name,
    node.questionToken,
    node.type,
    newFunctionBlock,
  );
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
  return ts.createBlock([
    ts.createReturn(
      ts.createCall(
        ts.createPropertyAccess(
          ts.createCall(flowExpression, undefined, [
            ts.createFunctionExpression(
              undefined,
              ts.createToken(ts.SyntaxKind.AsteriskToken),
              name,
              undefined,
              undefined,
              undefined,
              ts.isBlock(convertedBody)
                ? convertedBody
                : ts.createBlock([ts.createStatement(convertedBody)]),
            ),
          ]),
          'call',
        ),
        undefined,
        [ts.createThis()],
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

function hasTransformToMobxFlowDecorators(decorators: ts.NodeArray<ts.Decorator> | undefined) {
  if (
    decorators &&
    decorators.filter(
      x => ts.isIdentifier(x.expression) && x.expression.text === transformToMobxFlow,
    ).length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Returns all the decorators except for @transformToMobxFlow
 * Ensures to return undefined if the array is empty
 */
function filterOutTransformToMobxFlowDecorators(
  decorators: ts.NodeArray<ts.Decorator> | undefined,
): ts.Decorator[] | undefined {
  return (
    decorators &&
    decorators.reduce<ts.Decorator[] | undefined>((acc, x) => {
      // skip @transformToMobxFlow decorator
      if (ts.isIdentifier(x.expression) && x.expression.text === transformToMobxFlow) {
        return acc;
      }

      return acc ? [...acc, x] : [x];
    }, undefined)
  );
}

/**
 * Returns all the modifiers except for async
 * Ensures to return undefined if the array is empty
 */
function filterOutAsyncModifier(
  modifiers: ts.NodeArray<ts.Modifier> | undefined,
): ts.Modifier[] | undefined {
  return (
    modifiers &&
    modifiers.reduce<ts.Modifier[] | undefined>((acc, x) => {
      // skip async modifier
      if (x.kind === ts.SyntaxKind.AsyncKeyword) {
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
