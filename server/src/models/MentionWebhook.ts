import mongoose from "mongoose";

const mentionWebhookSchema = new mongoose.Schema(
  {
    // One destination per Echo user. It receives events only when that user is
    // explicitly mentioned in a message.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

mentionWebhookSchema.methods.toPublicJSON = function (signingSecret) {
  return {
    id: this._id.toString(),
    url: this.url,
    enabled: !!this.enabled,
    signingSecret,
    createdAt: this.createdAt,
  };
};

export const MentionWebhook = mongoose.model("MentionWebhook", mentionWebhookSchema);
