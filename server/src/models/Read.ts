import mongoose from "mongoose";

// Tracks how far a user has read in each channel/DM (for unread counts).
// A `thread` of null is the channel's main-timeline read marker; a non-null
// `thread` (a root message id) tracks reading within that specific thread,
// so a mention buried in a thread stays unread until the thread is opened
// (opening the channel's main view shouldn't clear it).
const readSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  thread: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  lastReadAt: { type: Date, default: Date.now },
});

readSchema.index({ user: 1, channel: 1, thread: 1 }, { unique: true });

export const Read = mongoose.model("Read", readSchema);
