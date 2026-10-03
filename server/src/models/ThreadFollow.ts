import mongoose from "mongoose";

const threadFollowSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  thread: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  // Missing/true means followed; false is an explicit per-thread mute.
  following: { type: Boolean, default: true },
}, { timestamps: true });

threadFollowSchema.index({ user: 1, thread: 1 }, { unique: true });
threadFollowSchema.index({ user: 1, updatedAt: -1 });

export const ThreadFollow = mongoose.model("ThreadFollow", threadFollowSchema);
