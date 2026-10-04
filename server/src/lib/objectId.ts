import mongoose from "mongoose";

export function isValidObjectId(value: unknown) {
  return mongoose.isValidObjectId(value);
}

export function validObjectId(value: unknown) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;
}
