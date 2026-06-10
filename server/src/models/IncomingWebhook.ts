import mongoose from "mongoose";

const incomingWebhookSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    tokenHash: { type: String, required: true, unique: true, index: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

incomingWebhookSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    channelId: this.channel.toString(),
    active: !!this.active,
    createdAt: this.createdAt,
  };
};

export const IncomingWebhook = mongoose.model("IncomingWebhook", incomingWebhookSchema);
