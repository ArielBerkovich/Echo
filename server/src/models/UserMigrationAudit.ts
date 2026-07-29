import mongoose from "mongoose";

const userMigrationAuditSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    oldUsername: { type: String, required: true },
    newUsername: { type: String, required: true },
    targetType: { type: String, enum: ["local", "rhsso"], required: true },
    rhssoIssuer: { type: String, default: null },
    rhssoSubject: { type: String, default: null },
    completedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false, versionKey: false }
);

export const UserMigrationAudit = mongoose.model("UserMigrationAudit", userMigrationAuditSchema);
