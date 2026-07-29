import mongoose from "mongoose";

const userAliasSchema = new mongoose.Schema(
  {
    aliasUsername: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 2,
      maxlength: 32,
      match: /^[a-z0-9_.-]+$/,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const UserAlias = mongoose.model("UserAlias", userAliasSchema);
