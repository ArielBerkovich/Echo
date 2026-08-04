import mongoose from "mongoose";

const workspaceSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "workspace" },
    name: { type: String, default: "Echo", trim: true, maxlength: 80 },
    logoKey: { type: String, default: null },
  },
  { timestamps: true }
);

workspaceSettingsSchema.methods.toPublicJSON = function () {
  return {
    name: this.name || "",
    logoUrl: this.logoKey ? `/api/files/${this.logoKey}` : null,
  };
};

export const WorkspaceSettings = mongoose.model("WorkspaceSettings", workspaceSettingsSchema);
