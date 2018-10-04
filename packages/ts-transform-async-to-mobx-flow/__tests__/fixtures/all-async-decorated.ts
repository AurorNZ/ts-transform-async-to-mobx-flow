/// <reference path="../../transformToMobxFlow.d.ts" />
declare let randomDecorator: any;

export const fn = transformToMobxFlow(async input => {
  return await Promise.resolve(input);
});
export const fn2 = transformToMobxFlow(async function test(input) {
  return await Promise.resolve(input);
});
export const fn3 = transformToMobxFlow(async function(input) {
  return await Promise.resolve(input);
});
export class Test {
  test: number = 0;
  constructor() {
    var nestedFlow = transformToMobxFlow(async () => {
      var anotherNestedFlow = transformToMobxFlow(async () => {
        this.test = 5;
        await Promise.resolve(100);
      });
      this.test = 5;
      await anotherNestedFlow();
    });
  }

  @transformToMobxFlow
  async func() {
    this.test = 5;
    await Promise.resolve(100);
  }

  @transformToMobxFlow
  funcBound = async () => {
    this.test = 5;
    await Promise.resolve(100);
  };

  @randomDecorator
  @transformToMobxFlow
  funcNonBound = async function(this: Test) {
    this.test = 5;
    await Promise.resolve(100);
  };
}
