import ts from 'typescript';
import fs from 'fs';

import createTransformer from '../src';

it('Does not convert function not marked as transformToMobxFlow', () => {
  const path = require.resolve('./fixtures/no-async-decorated');

  const source = fs.readFileSync(path).toString('utf8');
  const result = getTransformedOutput(source);

  expect(result).toMatchSnapshot();
});

it('Converts function marked as transformToMobxFlow', () => {
  const path = require.resolve('./fixtures/all-async-decorated');

  const source = fs.readFileSync(path).toString('utf8');
  const result = getTransformedOutput(source);

  expect(result).toMatchSnapshot();
});

describe('Throw error when cannot parse body of the transformToMobxFlow', () => {
  it('non-async arrow function', () => {
    const source = `
const fn = transformToMobxFlow(input => {
  this.delay(input);
});`;

    expect(() => getTransformedOutput(source)).toThrowError(
      'Could not resolve expression as async function',
    );
  });

  it('non-async function', () => {
    const source = `
const fn = transformToMobxFlow(function test (input) {
  this.delay(input);
});`;

    expect(() => getTransformedOutput(source)).toThrowError(
      'Could not resolve expression as async function',
    );
  });

  it('function passed as parameter', () => {
    const source = `
const fn = transformToMobxFlow(randomFunction);
`;

    expect(() => getTransformedOutput(source)).toThrowError(
      'Could not resolve expression as async function',
    );
  });

  describe('class context', () => {
    it('non-async function', () => {
      const source = `
class Test {
  // non-async function
  @transformToMobxFlow
  func() {
    this.test = 5;
  }
}`;
      expect(() => getTransformedOutput(source)).toThrowError(
        'Could not resolve expression as async function',
      );
    });

    it('non-async arrow function', () => {
      const source = `
  class Test {
    // non-async arrow function
    @transformToMobxFlow
    funcBound = () => {
      this.test = 5;
    };
  }`;
      expect(() => getTransformedOutput(source)).toThrowError(
        'Could not resolve expression as async function',
      );
    });

    it('function passed as parameter', () => {
      const source = `
  class Test {
    // function passed as parameter
    @transformToMobxFlow
    funcNonBound = randomFunction;
  }`;
      expect(() => getTransformedOutput(source)).toThrowError(
        'Could not resolve expression as async function',
      );
    });
  });
});

it('Flow import does not conflict with declared variables', () => {
  const source = `
import * as mobx from 'mobx';
let mobx_1 = '';

const fn = transformToMobxFlow(async input => {
  return await Promise.resolve(input);
});
`;
  const expectedOutput = `
import * as mobx_2 from "mobx";
import * as mobx from 'mobx';
let mobx_1 = '';
const fn = (input) => { return mobx_2.flow(function* fn() {
    return yield Promise.resolve(input);
}).call(this); };
`;

  verifyOutput(getTransformedOutput(source), expectedOutput);
});

it('Transpiled correctly to ES5', () => {
  const source = `
const fn = transformToMobxFlow(async input => {
  return await Promise.resolve(input);
});
  `;
    const expectedOutput = `
var _this = this;
var mobx = require("mobx");
var fn = function (input) { return mobx.flow(function fn() {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve(input)];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}).call(_this); };
  `;
  
    verifyOutput(getTranspiledOutput(source, ts.ScriptTarget.ES5), expectedOutput);
})

function verifyOutput(transformedOutput: string, expectedOutput: string) {
  expect(removeEmptyLines(transformedOutput)).toBe(removeEmptyLines(expectedOutput));
}

function getTranspiledOutput(sourceCode: string, target: ts.ScriptTarget): string {
  const result = ts.transpileModule(sourceCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      noEmitHelpers: true,
    },
    transformers: { before: [createTransformer()] },
  });

  return result.outputText;
}

function getTransformedOutput(sourceCode: string): string {
  const printer = ts.createPrinter();

  const source = ts.createSourceFile('', sourceCode, ts.ScriptTarget.ESNext, true);
  const result = ts.transform(source, [createTransformer()]);
  const transformedSourceFile = result.transformed[0];
  const resultCode = printer.printFile(transformedSourceFile);
  return resultCode;
}

function removeEmptyLines(input: string) {
  return input
    .split(/[\n\r]/g)
    .filter(x => !/^\s*$/.test(x))
    .join('\n');
}
