import mongoose from "mongoose";

const azureDevOpsIntegrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenCiphertext: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    active: { type: Boolean, default: true },
    notify: {
      pullRequestCreated: { type: Boolean, default: true },
      pullRequestApproved: { type: Boolean, default: true },
      pullRequestCompleted: { type: Boolean, default: true },
      pullRequestAbandoned: { type: Boolean, default: true },
      pullRequestReactivated: { type: Boolean, default: true },
      buildValidationFailed: { type: Boolean, default: true },
      buildValidationSucceeded: { type: Boolean, default: true },
    },
    lastReceivedAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true }
);

azureDevOpsIntegrationSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    active: !!this.active,
    notify: this.notify,
    lastReceivedAt: this.lastReceivedAt,
    lastError: this.lastError,
    createdAt: this.createdAt,
  };
};

export const AzureDevOpsIntegration = mongoose.model(
  "AzureDevOpsIntegration",
  azureDevOpsIntegrationSchema
);
