import mongoose from "mongoose";

const schema = new mongoose.Schema({
  integration: { type: mongoose.Schema.Types.ObjectId, ref: "JenkinsIntegration", required: true },
  eventKey: { type: String, required: true },
  eventType: { type: String, required: true },
  notificationKind: { type: String, default: null },
  status: { type: String, enum: ["processing", "delivered", "ignored", "unmatched", "failed"], default: "processing" },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  lastError: { type: String, default: null, maxlength: 500 },
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ integration: 1, eventKey: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

export const JenkinsEvent = mongoose.model("JenkinsEvent", schema);
