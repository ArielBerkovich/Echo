import mongoose from "mongoose";

const workspaceSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "workspace" },
    name: { type: String, default: "Echo", trim: true, maxlength: 80 },
    logoKey: { type: String, default: null },
    allure: {
      url: { type: String, default: "", trim: true, maxlength: 500 },
      username: { type: String, default: "", trim: true, maxlength: 200 },
      passwordCiphertext: { type: String, default: null },
      enabled: { type: Boolean, default: false },
      selectedProjectIds: { type: [String], default: [] },
      selectionConfigured: { type: Boolean, default: false },
      lastSyncedAt: { type: Date, default: null },
      lastError: { type: String, default: null, maxlength: 500 },
    },
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
