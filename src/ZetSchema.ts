
// src/ZetSchema.ts
export type ValidationResult<T> = { success: true; data: T } | { success: false; errors: Record<string, string> };
export type AsyncValidationResult<T> = Promise<ValidationResult<T>>;

export class ZetSchema<T> {
  private stages: Record<string, (value: unknown, parent?: any) => ValidationResult<T> | AsyncValidationResult<T>> = {};

  constructor(
    private validator: (value: unknown, parent?: any) => ValidationResult<T> | AsyncValidationResult<T>,
    private description: string = "value",
    private transform?: (value: T) => T,
    private cache?: Map<string, ValidationResult<T>>
  ) {
    this.stages["default"] = validator;
  }

  parse(value: unknown, parent?: any, stage: string = "default"): T | Promise<T> {
    const result = this.stages[stage] ? this.stages[stage](value, parent) : this.validator(value, parent);
    if (result instanceof Promise) {
      return result.then((res) => {
        if (res.success) return this.transform ? this.transform(res.data) : res.data;
        throw new Error(Object.values(res.errors)[0]);
      });
    }
    if (result.success) return this.transform ? this.transform(result.data) : result.data;
    throw new Error(Object.values(res.errors)[0]);
  }

  safeParse(value: unknown, parent?: any, stage: string = "default"): ValidationResult<T> | AsyncValidationResult<T> {
    const key = `${stage}:${JSON.stringify(value)}`;
    if (this.cache?.has(key)) return this.cache.get(key)!;
    const result = this.stages[stage] ? this.stages[stage](value, parent) : this.validator(value, parent);
    if (result instanceof Promise) {
      return result.then((res) => {
        const finalRes = { ...res, data: res.success && this.transform ? this.transform(res.data) : res.data };
        if (this.cache) this.cache.set(key, finalRes);
        return finalRes;
      });
    }
    const finalRes = { ...result, data: result.success && this.transform ? this.transform(result.data) : result.data };
    if (this.cache) this.cache.set(key, finalRes);
    return finalRes;
  }

  describe(description: string) {
    return new ZetSchema<T>(this.validator, description, this.transform, this.cache);
  }

  transform(fn: (value: T) => T) {
    return new ZetSchema<T>(this.validator, this.description, fn, this.cache);
  }

  optional() {
    return new ZetSchema<T | undefined>(
      (value) => {
        if (value === undefined) return { success: true, data: undefined };
        return this.validator(value);
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  extend() {
    return new ZetSchema<T>(this.validator, this.description, this.transform, this.cache);
  }

  cache() {
    return new ZetSchema<T>(this.validator, this.description, this.transform, new Map());
  }

  stage(name: string, fn: (schema: this) => ZetSchema<T>) {
    this.stages[name] = fn(this).validator;
    return this;
  }

  when<P>(condition: (parent: P) => boolean, then: (schema: this) => ZetSchema<T>, otherwise: (schema: this) => ZetSchema<T>) {
    return new ZetSchema<T>(
      (value, parent?: P) => (condition(parent ?? ({} as P)) ? then(this) : otherwise(this)).validator(value, parent),
      this.description,
      this.transform,
      this.cache
    );
  }

  type(allowedTypes: string[], message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (result.data instanceof File && !allowedTypes.includes(result.data.type)) {
          return { success: false, errors: { [this.description]: message || `${this.description} must be one of: ${allowedTypes.join(", ")}` } };
        }
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  maxSizeMB(maxMB: number, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (result.data instanceof File && result.data.size > maxMB * 1024 * 1024) {
          return { success: false, errors: { [this.description]: message || `${this.description} must not exceed ${maxMB}MB` } };
        }
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  dimensions({ minWidth, maxWidth, minHeight, maxHeight }: { minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number }, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (!(result.data instanceof File) || !result.data.type.startsWith("image/")) return result;
        const img = new Image();
        const url = URL.createObjectURL(result.data);
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          img.onload = () => resolve({ width: img.width, height: img.height });
          img.onerror = reject;
          img.src = url;
        });
        URL.revokeObjectURL(url);
        const errors: string[] = [];
        if (minWidth && dimensions.width < minWidth) errors.push(`width must be at least ${minWidth}px`);
        if (maxWidth && dimensions.width > maxWidth) errors.push(`width must not exceed ${maxWidth}px`);
        if (minHeight && dimensions.height < minHeight) errors.push(`height must be at least ${minHeight}px`);
        if (maxHeight && dimensions.height > maxHeight) errors.push(`height must not exceed ${maxHeight}px`);
        if (errors.length > 0) {
          return { success: false, errors: { [this.description]: message || `${this.description} has invalid dimensions: ${errors.join(", ")}` } };
        }
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  maxDuration(seconds: number, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (!(result.data instanceof File) || (!result.data.type.startsWith("video/") && !result.data.type.startsWith("audio/"))) return result;
        const media = document.createElement(result.data.type.startsWith("video/") ? "video" : "audio");
        const url = URL.createObjectURL(result.data);
        const duration = await new Promise<number>((resolve, reject) => {
          media.onloadedmetadata = () => resolve(media.duration);
          media.onerror = reject;
          media.src = url;
        });
        URL.revokeObjectURL(url);
        if (duration > seconds) {
          return { success: false, errors: { [this.description]: message || `${this.description} must not exceed ${seconds} seconds` } };
        }
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  namePattern(regex: RegExp, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (result.data instanceof File && !regex.test(result.data.name)) {
          return { success: false, errors: { [this.description]: message || `${this.description} name does not match the required pattern` } };
        }
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  extension(extensions: string[], message?: string) {
    const mimeMap: Record<string, string> = { jpg: "image/jpeg", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg" };
    const allowedTypes = extensions.map((ext) => mimeMap[ext.toLowerCase()] || `application/${ext}`);
    return this.type(allowedTypes, message || `${this.description} must have one of these extensions: ${extensions.join(", ")}`);
  }

  compress({ maxSizeMB, quality }: { maxSizeMB: number; quality: number }, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (!(result.data instanceof File) || !result.data.type.startsWith("image/")) return result;
        if (result.data.size <= maxSizeMB * 1024 * 1024) return result;
        const img = new Image();
        const url = URL.createObjectURL(result.data);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const compressedBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), result.data.type, quality));
        URL.revokeObjectURL(url);
        const compressedFile = new File([compressedBlob], result.data.name, { type: result.data.type });
        if (compressedFile.size > maxSizeMB * 1024 * 1024) {
          return { success: false, errors: { [this.description]: message || `${this.description} could not be compressed below ${maxSizeMB}MB` } };
        }
        return { success: true, data: compressedFile as any };
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  serverValidate(check: (file: File, opts: { onProgress: (progress: number) => void }) => Promise<boolean>, message?: string) {
    return new ZetSchema<T>(
      async (value, parent, { onProgress }: { onProgress?: (field: string, progress: number) => void } = {}) => {
        const result = await this.validator(value, parent);
        if (!result.success) return result;
        if (!(result.data instanceof File)) return result;
        const isValid = await check(result.data, {
          onProgress: (progress) => onProgress?.(this.description, progress),
        });
        if (!isValid) return { success: false, errors: { [this.description]: message || "Server rejected the file" } };
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  metadata(check: (metadata: any) => boolean, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (!(result.data instanceof File) || !result.data.type.startsWith("image/")) return result;
        const img = new Image();
        const url = URL.createObjectURL(result.data);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        const metadata = { width: img.width, height: img.height };
        URL.revokeObjectURL(url);
        if (!check(metadata)) {
          return { success: false, errors: { [this.description]: message || `${this.description} metadata is invalid` } };
        }
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  query({ mutationFn, errorMessage }: { mutationFn: (value: T) => Promise<boolean>; errorMessage: string }) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        const isValid = await mutationFn(result.data);
        if (!isValid) return { success: false, errors: { [this.description]: errorMessage } };
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  toJSON() {
    return { description: this.description, validator: "serialized", transform: this.transform ? "serialized" : undefined };
  }

  static fromJSON<T>(json: any) {
    return new ZetSchema<T>((value) => ({ success: true, data: value as T }), json.description);
  }

  formRule?: (data: any) => string | true;

  aiValidate(check: (file: File) => Promise<boolean>, message?: string) {
    return new ZetSchema<T>(
      async (value) => {
        const result = await this.validator(value);
        if (!result.success) return result;
        if (!(result.data instanceof File)) return result;
        const isValid = await check(result.data);
        if (!isValid) return { success: false, errors: { [this.description]: message || "AI rejected the file" } };
        return result;
      },
      this.description,
      this.transform,
      this.cache
    );
  }

  // Add other methods like pattern, minAge, etc., here if needed...
    }
