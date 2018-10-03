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
  value: string = '';

  constructor() {
    var nestedFlow = transformToMobxFlow(async () => {
      var anotherNestedFlow = transformToMobxFlow(async () => {
        return await Promise.resolve('5');
      });
      await anotherNestedFlow();
    });
  }

  @transformToMobxFlow
  async func(input: string) {
    this.value = await Promise.resolve(input);
  }

  @transformToMobxFlow
  funcBound = async (input: string) => {
    this.value =  await Promise.resolve(input);
  };

  @transformToMobxFlow
  funcNonBound = async function(input: string) {
    return await Promise.resolve(input);
  };
}
