// src/useZetForm.ts
import { useState, useCallback } from "react";
import { ZetSchema } from "./ZetSchema";

export type UseZetFormOptions<T> = {
  withPreviews?: boolean;
  errorFormatter?: (field: string, message: string) => string;
  lazy?: boolean;
  accessibility?: boolean;
};

export function useZetForm<T>(schemaInstance: ZetSchema<T>, initialValue: T, options: UseZetFormOptions<T> = {}) {
  const [value, setValue] = useState<T>(initialValue);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const validate = useCallback(
    async (data: unknown, stage: string = "default") => {
      setIsValidating(true);
      setValidationProgress({ [stage]: `Validating ${stage}...` });
      const result = await schemaInstance.safeParse(data, data, stage, {
        onProgress: (field, progress) => setUploadProgress((prev) => ({ ...prev, [field]: progress })),
      });
      setIsValidating(false);
      setValidationProgress({});

      if (!result.success) {
        const formattedErrors = options.errorFormatter
          ? Object.fromEntries(Object.entries(result.errors).map(([field, msg]) => [field, options.errorFormatter!(field, msg)]))
          : result.errors;
        setErrors(formattedErrors);
        return false;
      }

      setValue(result.data);
      setErrors({});

      if (options.withPreviews) {
        const newPreviews: Record<string, string> = {};
        for (const [key, val] of Object.entries(result.data)) {
          if (val instanceof File) newPreviews[key] = URL.createObjectURL(val);
        }
        setPreviews(newPreviews);
      }
      return true;
    },
    [schemaInstance, options]
  );

  const validateStage = (stage: string) => validate(value, stage);

  const handleChange = (field: keyof T) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = { ...value };
    if (e.target.type === "file" && e.target.files) {
      newValue[field] = (e.target.multiple ? Array.from(e.target.files) : e.target.files[0]) as any;
    } else {
      newValue[field] = e.target.value as any;
    }
    setValue(newValue);
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (!options.lazy) validate(newValue);
  };

  const handleBlur = (field: keyof T) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (!options.lazy) validate(value);
  };

  const handleSubmit = (onSubmit: (data: T) => void) => async (e: React.FormEvent) => {
    e.preventDefault();
    if (await validate(value)) onSubmit(value);
  };

  const inputProps = Object.keys(initialValue).reduce(
    (acc, key) => ({
      ...acc,
      [key]: options.accessibility
        ? {
            "aria-invalid": errors[key] ? "true" : "false",
            "aria-describedby": errors[key] ? `${key}-error` : undefined,
          }
        : {},
    }),
    {} as Record<keyof T, any>
  );

  return {
    value,
    errors,
    touched,
    isValidating,
    validationProgress,
    previews,
    uploadProgress,
    handleChange,
    handleBlur,
    handleSubmit,
    validateStage,
    inputProps,
    setValue,
  };
}
