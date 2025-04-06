// src/useZetForm.ts
import * as React from "react";
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
    })
}
     
