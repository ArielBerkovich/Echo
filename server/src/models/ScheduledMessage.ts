import mongoose from "mongoose";

// A message queued to be delivered at a future time. A background dispatcher
// turns due rows into real messages and removes them.
const scheduledMessageSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", maxlength: 4000 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    attachments: [
      {
        _id: false,
        key: String,
        name: String,
        size: Number,
        contentType: String,
        isImage: Boolean,
        width: Number,
        height: Number,
      },
    ],
    scheduledFor: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

scheduledMessageSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    channelId: this.channel.toString(),
    body: this.body,
    parentId: this.parentId ? this.parentId.toString() : null,
    attachments: (this.attachments || []).map((a) => ({
      key: a.key,
      name: a.name,
      size: a.size,
      contentType: a.contentType,
      isImage: a.isImage,
      width: a.width || null,
      height: a.height || null,
      url: `/api/files/${a.key}`,
    })),
    scheduledFor: this.scheduledFor,
  };
};

export const ScheduledMessage = mongoose.model("ScheduledMessage", scheduledMessageSchema);
