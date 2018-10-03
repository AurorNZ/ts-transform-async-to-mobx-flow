import ts from 'typescript';
import fs from 'fs';

import createTransformer from '../src';

it('Does not convert function not marked as transformToMobxFlow', () => {
  const path = require.resolve('./fixtures/no-async-decorated');

  const source = fs.readFileSync(path).toString('utf8');
  const result = getOutput(source);

  expect(result.outputText).toMatchSnapshot();
});

it('Converts function marked as transformToMobxFlow', () => {
  const path = require.resolve('./fixtures/all-async-decorated');

  const source = fs.readFileSync(path).toString('utf8');
  const result = getOutput(source);

  expect(result.outputText).toMatchSnapshot();
});

describe('Throw error when cannot parse body of the transformToMobxFlow', () => {
  it('non-async arrow function', () => {
    const source = `
const fn = transformToMobxFlow(input => {
  this.delay(input);
});`;

    expect(() => getOutput(source)).toThrowError('Could not resolve expression as async function');
  });

  it('non-async function', () => {
    const source = `
const fn = transformToMobxFlow(function test (input) {
  this.delay(input);
});`;

    expect(() => getOutput(source)).toThrowError('Could not resolve expression as async function');
  });

  it('function passed as parameter', () => {
    const source = `
const fn = transformToMobxFlow(randomFunction);
`;

    expect(() => getOutput(source)).toThrowError('Could not resolve expression as async function');
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
      expect(() => getOutput(source)).toThrowError(
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
      expect(() => getOutput(source)).toThrowError(
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
      expect(() => getOutput(source)).toThrowError(
        'Could not resolve expression as async function',
      );
    });
  });
});

it('Flow import does not conflict with declared variables', () => {
  const source = `
import { flow as flow_1 } from 'mobx';
let flow_2 = flow_1('flow2');

const fn = transformToMobxFlow(async input => {
  await this.delay(input);
});
`;
  const expectedOutput = `
import { flow as flow_3 } from \"mobx\";
import { flow as flow_1 } from 'mobx';
let flow_2 = flow_1('flow2');
const fn = (input) => { return flow_3(function* fn() {
    yield this.delay(input);
}).call(this); };
`;

  verifyOutput(source, expectedOutput);
});

function verifyOutput(source: string, expectedOutput: string) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      noEmitHelpers: true,
    },
    transformers: { before: [createTransformer()] },
  });
  expect(removeEmptyLines(result.outputText)).toBe(removeEmptyLines(expectedOutput));
}

function getOutput(source: string) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      noEmitHelpers: true,
    },
    transformers: { before: [createTransformer()] },
  });
  return result;
}

function removeEmptyLines(input: string) {
  return input
    .split(/[\n\r]/g)
    .filter(x => !/^\s*$/.test(x))
    .join('\n');
}
