import { Schema, model } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  tokens: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Retained until expiry so in-flight requests can reconcile after account deletion.
export const SpendBudget = model("SpendBudget", schema);
