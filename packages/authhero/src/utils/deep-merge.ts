type Primitive = string | number | boolean | symbol | bigint | null | undefined;

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Primitive
    ? T[P]
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : DeepPartial<T[P]>;
};

export function deepMergePatch<T>(target: T, patch: DeepPartial<T>): T {
  const result = structuredClone(target);

  function internalMerge(t: any, p: any): any {
    for (const key in p) {
      if (
        p[key] !== undefined &&
        typeof p[key] === "object" &&
        !Array.isArray(p[key]) &&
        typeof t[key] === "object" &&
        t[key] !== null
      ) {
        internalMerge(t[key], p[key]);
      } else {
        t[key] = p[key];
      }
    }
    return t;
  }

  return internalMerge(result, patch);
}
