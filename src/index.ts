// src/index.ts
export { ZetSchema } from "./ZetSchema";
export { string, file, image, array, object, formRule } from "./primitives";
export { useZetForm, type UseZetFormOptions } from "./useZetForm";

export const ZetValidation = {
  string,
  file,
  image,
  array,
  object,
  formRule,
  useZetForm,
  fromJSON: ZetSchema.fromJSON,
};
