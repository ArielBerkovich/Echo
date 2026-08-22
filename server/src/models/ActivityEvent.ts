import mongoose from "mongoose";

// One persistent notification in the user's Activity feed. Conversation read
// markers are deliberately not used here: a notification can be read without
// marking an entire channel or thread read.
const activityEventSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, default: "reaction" },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  message: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  emoji: { type: String, default: "" },
  readAt: { type: Date, default: null },
  // Stable identity for message-derived notifications and future event types.
  sourceKey: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

activityEventSchema.index({ recipient: 1, createdAt: -1 });
activityEventSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

export const ActivityEvent = mongoose.model("ActivityEvent", activityEventSchema);
