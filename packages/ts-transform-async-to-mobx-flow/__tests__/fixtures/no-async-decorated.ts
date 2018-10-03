export async function fn(input) {
  await this.delay(this.input);
}
export const fn2 = async input => {
  await this.delay(this.input);
};
export class Test {
  test: number = 0;
  constructor() {
    var nestedFlow = async () => {
      var anotherNestedFlow = async () => {
        this.test = 5;
        await Promise.resolve(100);
      };
      this.test = 5;
      await anotherNestedFlow();
    };
  }

  async func() {
    this.test = 5;
    await Promise.resolve(100);
  }

  funcBound = async () => {
    this.test = 5;
    await Promise.resolve(100);
  };

  funcNonBound = async function() {
    this.test = 5;
    await Promise.resolve(100);
  };
}
