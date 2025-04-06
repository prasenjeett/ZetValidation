// src/primitives.ts
import { ZetSchema } from "./ZetSchema";

export const string = () =>
  new ZetSchema<string>((value) => {
    if (typeof value !== "string") return { success: false, errors: { value: "Expected a string" } };
    return { success: true, data: value };
  });

export const file = () =>
  new ZetSchema<File>((value) => {
    if (!(value instanceof File)) return { success: false, errors: { value: "Expected a file" } };
    return { success: true, data: value };
  });

export const image = () => file().type(["image/jpeg", "image/png"]).maxSizeMB(5).dimensions({ minWidth: 100, minHeight: 100 });

export const array = <T>(itemSchema: ZetSchema<T>, options: { batchConcurrency?: number } = {}) =>
  new ZetSchema<T[]>(async (value) => {
    if (!Array.isArray(value)) return { success: false, errors: { value: "Expected an array" } };
    const result: T[] = [];
    const errors: Record<string, string> = {};
    const concurrency = options.batchConcurrency || 4;
    for (let i = 0; i < value.length; i += concurrency) {
      const batch = value.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (item, index) => {
          const itemResult = await itemSchema.safeParse(item);
          if (!itemResult.success) Object.entries(itemResult.errors).forEach(([key, msg]) => (errors[`${i + index}.${key}`] = msg));
          else result.push(itemResult.data);
        })
      );
    }
    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true, data: result };
  });

export const object = <T extends Record<string, ZetSchema<any>>>(shape: T) => {
  type InferredType = { [K in keyof T]: T[K] extends ZetSchema<infer U> ? U : never };
  const instance = new ZetSchema<InferredType>(async (value) => {
    if (typeof value !== "object" || value === null) return { success: false, errors: { value: "Expected an object" } };
    const result: Partial<InferredType> = {};
    const errors: Record<string, string> = {};
    await Promise.all(
      Object.entries(shape).map(async ([key, schema]) => {
        const fieldResult = await schema.safeParse((value as any)[key], value);
        if (!fieldResult.success) Object.assign(errors, fieldResult.errors);
        else result[key] = fieldResult.data;
      })
    );
    if (Object.keys(errors).length === 0 && instance.formRule) {
      const ruleResult = instance.formRule(result);
      if (ruleResult !== true) errors["form"] = ruleResult;
    }
    return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true, data: result as InferredType };
  });
  instance.formRule = undefined;
  return instance;
};

export function formRule<T>(schemaInstance: ZetSchema<T>, rule: (data: T) => string | true) {
  schemaInstance.formRule = rule;
  return schemaInstance;
}