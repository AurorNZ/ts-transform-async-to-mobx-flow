declare function transformToMobxFlow<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T,
): T;

// Method decorator
declare function transformToMobxFlow<T extends (...args: any[]) => Promise<any>>(
  target: Object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
): TypedPropertyDescriptor<T> | void;

// Property decorator
declare function transformToMobxFlow(target: Object, propertyKey: string | symbol): void;
