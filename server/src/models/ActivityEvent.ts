import mongoose from "mongoose";

// A non-message activity event (currently: someone reacted to your message).
// Mentions and thread-reply activity are still derived from messages directly;
// reactions need an explicit record since they carry no per-user timestamp.
const activityEventSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, default: "reaction" },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  message: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
  emoji: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const ACTIVITY_RETENTION_SECONDS = 30 * 24 * 60 * 60;

activityEventSchema.index({ recipient: 1, createdAt: -1 });
// Keep persisted activity aligned with the feed's rolling 30-day window.
// Mongo's TTL monitor performs this cleanup asynchronously.
activityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: ACTIVITY_RETENTION_SECONDS });
// One event per (recipient, actor, message, emoji) — re-reacting just refreshes it.
activityEventSchema.index({ recipient: 1, actor: 1, message: 1, emoji: 1 }, { unique: true });

export const ActivityEvent = mongoose.model("ActivityEvent", activityEventSchema);
