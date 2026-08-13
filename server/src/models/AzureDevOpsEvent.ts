import mongoose from "mongoose";

const azureDevOpsEventSchema = new mongoose.Schema(
  {
    integration: { type: mongoose.Schema.Types.ObjectId, ref: "AzureDevOpsIntegration", required: true },
    eventKey: { type: String, required: true },
    eventType: { type: String, required: true },
    notificationKind: { type: String, default: null },
    approvalState: { type: Boolean, default: null },
    status: { type: String, enum: ["processing", "delivered", "ignored", "unmatched", "failed"], default: "processing" },
    attempts: { type: Number, default: 1 },
    lastError: { type: String, default: null, maxlength: 500 },
    pullRequestNumber: { type: Number, default: null, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

azureDevOpsEventSchema.index({ integration: 1, eventKey: 1 }, { unique: true });
azureDevOpsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

export const AzureDevOpsEvent = mongoose.model("AzureDevOpsEvent", azureDevOpsEventSchema);
