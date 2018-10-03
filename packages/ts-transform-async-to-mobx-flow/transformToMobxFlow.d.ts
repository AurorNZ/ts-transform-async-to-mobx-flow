/** 
 * Marks an `async` functions to transform into a generator function wrapped with `mobx.flow` 
 * by [ts-transform-async-to-mobx-flow](https://github.com/AurorNZ/ts-transform-async-to-mobx-flow) 
 * @example
```
// in:
const fn = transformToMobxFlow(async (input) => {
  return await callApi(input);
})

// out:
import { flow as flow_1 } from 'mobx';

const fn = (input) => {
  return flow_1(function* fn() {
    return yield callApi(input);
  }).call(this);
} 
```
 */
declare function transformToMobxFlow<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T,
): T;

/** 
 * Marks an `async` method to transform into a generator function wrapped with `mobx.flow` 
 * by [ts-transform-async-to-mobx-flow](https://github.com/AurorNZ/ts-transform-async-to-mobx-flow)
 * @example
```
// in:
class Test {
  @transformToMobxFlow
  async fn(input) {
    return await callApi(input);
  }
}

// out:
import { flow as flow_1 } from 'mobx';

class Test {
  fn(input) {
    return flow_1(function* fn() {
      return yield callApi(input);
    }).call(this);
  }
}
```
 */
declare function transformToMobxFlow<T extends (...args: any[]) => Promise<any>>(
  target: Object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
): TypedPropertyDescriptor<T> | void;

/** 
 * Marks an `async` property function to transform into a generator function wrapped with `mobx.flow` 
 * by [ts-transform-async-to-mobx-flow](https://github.com/AurorNZ/ts-transform-async-to-mobx-flow)
 * @example
```
// in:
class Test {
  @transformToMobxFlow
  fn = async (input) => {
    return await callApi(input);
  }
}

// out:
import { flow as flow_1 } from 'mobx';

class Test {
  constructor() {
    // typescript moves property functions inside the constructor
    this.fn = (input) => {
      return flow_1(function* fn() {
        return yield callApi(input);
      }).call(this);
    };
  }
}
```
 */
declare function transformToMobxFlow(target: Object, propertyKey: string | symbol): void;
