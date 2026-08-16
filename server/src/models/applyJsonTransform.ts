import mongoose from "mongoose";

export function applyJsonTransform(schema: mongoose.Schema, hiddenFields: string[] = []): void {
  const transform = (_doc: unknown, ret: Record<string, unknown>): Record<string, unknown> => {
    if (ret._id !== undefined) {
      ret.id = String(ret._id);
      delete ret._id;
    }

    for (const field of hiddenFields) {
      delete ret[field];
    }

    return ret;
  };

  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform,
  });

  schema.set("toObject", {
    virtuals: true,
    versionKey: false,
    transform,
  });
}
