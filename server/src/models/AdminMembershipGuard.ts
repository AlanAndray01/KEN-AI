import { Schema, model } from "mongoose";

// Every supported admin removal writes this row in the same transaction as its
// count and deletion, forcing concurrent removals to retry with a fresh count.
export const AdminMembershipGuard = model("AdminMembershipGuard", new Schema({
  _id: { type: String, required: true },
  version: { type: Number, default: 0 },
}));
