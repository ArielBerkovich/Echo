import mongoose from "mongoose";

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  activityId: { type: String, required: true },
  seenThrough: { type: Date, required: true },
  activityCreatedAt: { type: Date, required: true },
});
const ACTIVITY_RETENTION_SECONDS = 30 * 24 * 60 * 60;
schema.index({ user: 1, activityId: 1 }, { unique: true });
schema.index({ activityCreatedAt: 1 }, { expireAfterSeconds: ACTIVITY_RETENTION_SECONDS });
export const ActivityRead = mongoose.model("ActivityRead", schema);
