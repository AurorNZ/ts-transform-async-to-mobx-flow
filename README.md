# ts-transform-async-to-mobx-flow

[![npm](https://img.shields.io/npm/v/ts-transform-async-to-mobx-flow.svg)](https://www.npmjs.com/package/ts-transform-async-to-mobx-flow)

Converts typescript async functions into generators wrapped with mobx.flow.
Inspired by [babel-plugin-mobx-async-action](https://github.com/Strate/babel-plugin-mobx-async-action) and [ts-plugin-mst-async-action](https://github.com/newraina/ts-plugin-mst-async-action)

## What it is

In order to run all updates to observables within async functions in `mobx.action`, `mobx` provides [`flow`](https://mobx.js.org/best/actions.html) helper. `flow` can only work with generator functions `function*`.

The main drawback of generator functions is that they don't have type checking. For example:

```ts
function callApi(): Promise<string> {
  return Promise.resolve('response');
}

function* func() {
  const response = yield callApi(); //response is resolved to any
}

async function func2() {
  const response = await callApi(); //response is resolved to string
}
```

This transfomer is created to allow usage of `flow` with `async` functions in order to get both type checking.

### Example

#### Input

```ts
/// <reference path="node_modules/ts-transform-async-to-mobx-flow/transformToMobxFlow.d.ts" />
const fn = transformToMobxFlow(async input => {
  return await Promise.resolve(input);
});

class Test {
  value: string = '';

  @transformToMobxFlow
  async func(input: string) {
    this.value = await Promise.resolve(input);
  }
}
```

#### Output

```js
import { flow as flow1 } from 'mobx';
const fn = input => {
  return flow_1(function* fn() {
    return yield Promise.resolve(input);
  }).call(this);
};

class Test {
  func(input) {
    return flow_1(function* func() {
      this.value = yield Promise.resolve(input);
    }).call(this);
  }
}
```

## How to install

```
npm i ts-transform-async-to-mobx-flow -D
```

or

```
yarn add ts-transform-async-to-mobx-flow -D
```

## How to use

You may need to add a reference to this package's typescript definition file in order to declare the global `transformToMobxFlow` function:

```ts
/// <reference path="node_modules/ts-transform-async-to-mobx-flow/transformToMobxFlow.d.ts" />
```

It can be added to a `global.d.ts` file to access `transformToMobxFlow` in all the project files.

### With [ttypescript](https://github.com/cevek/ttypescript)

`tsconfig.json`

```json
{
  "compilerOptions": {
    "...": "...",
    "plugins": [{ "transform": "ts-transform-async-to-mobx-flow", "type": "config" }]
  }
}
```

### With [ts-loader](https://github.com/TypeStrong/ts-loader)

```js
// webpack.config.js
const tsTransformAsyncToMobxFlow = require('ts-transform-async-to-mobx-flow').default;

module.exports = {
  // ...
  module: {
    rules: [
      {
        test: /\.(tsx|ts)$/,
        loader: 'ts-loader',
        options: {
          getCustomTransformers: () => ({
            before: [tsTransformAsyncToMobxFlow(/** options */)],
          }),
        },
      },
    ],
  },
  // ...
};
```

### With ts-loader and ttypescript

`tsconfig.json`

```json
{
  "compilerOptions": {
    "...": "...",
    "plugins": [{ "transform": "ts-transform-async-to-mobx-flow", "type": "config" }]
  }
}
```

```js
// webpack.config.js
const tsTransformAsyncToMobxFlow = require('ts-transform-async-to-mobx-flow').default;

module.exports = {
  // ...
  module: {
    rules: [
      {
        test: /\.(tsx|ts)$/,
        loader: 'ts-loader',
        options: {
          compiler: 'ttypescript',
        },
      },
    ],
  },
  // ...
};
```

### With ts-jest

Using custom compiler, for example 'ttypescript' https://kulshekhar.github.io/ts-jest/user/config/compiler

Alternatively, using `ts-jest` `astTransformers`. At the moment, there is no official documentation for `astTransformers`, but it is part of `ts-jest` API since 23.10.0 https://github.com/kulshekhar/ts-jest/blob/master/CHANGELOG.md#23100-beta3-2018-09-06

```json
// package.json
{
  "jest": {
    "globals": {
      "ts-jest": {
        "astTransformers": [
          "ts-transform-async-to-mobx-flow"
        ]
      }
    },
}
```

### Configuration

- mobxPackage `string`

  default: `'mobx'`
