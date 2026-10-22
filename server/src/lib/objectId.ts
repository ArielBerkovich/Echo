import mongoose from "mongoose";

export function isValidObjectId(value: unknown) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export function validObjectId(value: unknown) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;
}
