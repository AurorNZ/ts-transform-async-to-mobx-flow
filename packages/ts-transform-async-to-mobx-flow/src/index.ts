import ts from 'typescript';

export interface Options {
  mobxPackage: string;
}

const transformToMobxFlow = 'transformToMobxFlow';

/**
 * 1. Look for functions marked as @transformToMobxFlow or transformToMobxFlow(...)
 * 2. Transform them to generator functions wrapped into mobx.flow
 * 3. Adds import to mobx.flow if there's anything transformed
 */
export default function createTransformer({
  mobxPackage = 'mobx',
}: Partial<Options> = {}): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => source => {
    const flowIdenfitier = ts.createUniqueName('flow');
    let transformed = false;

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
            flowIdenfitier,
            name,
            visitor(fn.body) as ts.ConciseBody,
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
          flowIdenfitier,
          ts.isIdentifier(node.name) ? node.name : undefined,
          visitor(node.body) as ts.Block,
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

        transformed = true;

        if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
          const newFunctionBlock = createNewFunctionBlock(
            flowIdenfitier,
            ts.isIdentifier(node.name) ? node.name : undefined,
            visitor(fn.body) as ts.ConciseBody,
            context,
          );

          return transformPropertyDeclaration(node, transformFunction(fn, newFunctionBlock));
        }
      }

      return ts.visitEachChild(node, visitor, context);
    };

    const convertToFlowResult = ts.visitEachChild(source, visitor, context);

    // if there's anything converted, we need to add "import {flow} from 'mobx'"
    if (transformed) {
      const importFlowStatement = ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(
          undefined,
          ts.createNamedImports([
            ts.createImportSpecifier(ts.createIdentifier('flow'), flowIdenfitier),
          ]),
        ),
        ts.createLiteral(mobxPackage),
      );
      return ts.updateSourceFileNode(
        convertToFlowResult,
        [importFlowStatement, ...convertToFlowResult.statements],
        convertToFlowResult.isDeclarationFile,
        convertToFlowResult.referencedFiles,
        convertToFlowResult.typeReferenceDirectives,
        convertToFlowResult.hasNoDefaultLib,
        convertToFlowResult.libReferenceDirectives,
      );
    }

    return convertToFlowResult;
  };
}

function createNewFunctionBlock(
  flowIdenfitier: ts.Identifier,
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

  return createWrappedFunctionBlock(flowIdenfitier, name, convertedBody);
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
  flowIdenfitier: ts.Identifier,
  name: ts.Identifier | undefined,
  convertedBody: ts.ConciseBody,
) {
  return ts.createBlock([
    ts.createReturn(
      ts.createCall(
        ts.createPropertyAccess(
          ts.createCall(flowIdenfitier, undefined, [
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
