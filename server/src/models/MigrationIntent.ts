import mongoose from "mongoose";

const migrationIntentSchema = new mongoose.Schema(
  {
    sourceUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    sourceUsername: { type: String, default: null },
    sourceTokenVersion: { type: Number, default: null },
    targetType: { type: String, enum: ["local", "rhsso"], required: true },
    targetIssuer: { type: String, default: null },
    targetSubject: { type: String, default: null },
    targetUsername: { type: String, default: null },
    targetIdentityLabel: { type: String, default: null },
    status: {
      type: String,
      enum: ["source_verified", "identity_verified", "consumed"],
      default: "source_verified",
      index: true,
    },
    consumedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

migrationIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MigrationIntent = mongoose.model("MigrationIntent", migrationIntentSchema);
