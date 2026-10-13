import mongoose from "mongoose";

const workspaceSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "workspace" },
    name: { type: String, default: "Echo", trim: true, maxlength: 80 },
    logoKey: { type: String, default: null },
    azureWorkItems: {
      enabled: { type: Boolean, default: false },
      projectUrl: { type: String, default: "", trim: true, maxlength: 500 },
      urlPrefix: { type: String, default: "", trim: true, maxlength: 500 },
      tokenCiphertext: { type: String, default: null },
      hasToken: { type: Boolean, default: false },
      expiresAt: { type: Date, default: null },
      notifyChannel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", default: null },
      lastReminderKey: { type: String, default: null },
      lastError: { type: String, default: null, maxlength: 500 },
    },
    allure: {
      url: { type: String, default: "", trim: true, maxlength: 500 },
      username: { type: String, default: "", trim: true, maxlength: 200 },
      passwordCiphertext: { type: String, default: null },
      enabled: { type: Boolean, default: false },
      selectedProjectIds: { type: [String], default: [] },
      channelMappings: {
        type: [{
          _id: false,
          projectId: { type: String, trim: true, maxlength: 200 },
          channelName: { type: String, trim: true, maxlength: 64 },
        }],
        default: [],
      },
      selectionConfigured: { type: Boolean, default: false },
      lastSyncedAt: { type: Date, default: null },
      lastError: { type: String, default: null, maxlength: 500 },
    },
  },
  { timestamps: true }
);

workspaceSettingsSchema.methods.toPublicJSON = function () {
  const legacyProjectUrl = String(this.azureWorkItems?.urlPrefix || "").replace(/\/_workitems\/edit\/?$/i, "");
  const azureProjectUrl = this.azureWorkItems?.projectUrl || legacyProjectUrl;
  return {
    name: this.name || "",
    logoUrl: this.logoKey ? `/api/files/${this.logoKey}` : null,
    azureWorkItems: {
      enabled: !!this.azureWorkItems?.enabled && !!this.azureWorkItems?.tokenCiphertext && !!azureProjectUrl,
      projectUrl: azureProjectUrl,
    },
  };
};

export const WorkspaceSettings = mongoose.model("WorkspaceSettings", workspaceSettingsSchema);
