import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Body is optional when the message carries one or more attachments.
    body: { type: String, default: "", trim: true, maxlength: 4000 },
    // Uploaded files stored in object storage; metadata only lives here.
    attachments: [
      {
        _id: false,
        key: String, // object-storage key
        name: String, // original filename
        size: Number, // bytes
        contentType: String,
        isImage: Boolean,
        width: Number, // natural pixel size (images only, for layout)
        height: Number,
      },
    ],
    // "user" messages are normal; "system" are join/create event logs.
    kind: { type: String, enum: ["user", "system"], default: "user" },
    // Set on thread replies — points at the root message of the thread.
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null, index: true },
    // Denormalized activity fields. These let /api/activity use indexed lookups
    // instead of scanning recent message bodies with regexes.
    mentionedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    mentionsEveryone: { type: Boolean, default: false, index: true },
    threadRootAuthor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // External automation metadata. `idempotencyKey` prevents duplicate posts
    // from retried CI requests; `externalKey` lets integrations update the same
    // logical message over time.
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    externalKey: { type: String, trim: true, maxlength: 256 },
    automation: {
      type: {
        _id: false,
        source: { type: String, default: "api", trim: true, maxlength: 32 },
        status: { type: String, default: null, trim: true, maxlength: 32 },
        title: { type: String, default: null, trim: true, maxlength: 200 },
        threadKey: { type: String, default: null, trim: true, maxlength: 256 },
        fields: [
          {
            _id: false,
            name: { type: String, trim: true, maxlength: 64 },
            value: { type: String, trim: true, maxlength: 400 },
          },
        ],
      },
      default: null,
    },
    // Set when the author edits the message; drives the "(edited)" label.
    editedAt: { type: Date, default: null },
    // Snapshot of the source when this message was forwarded from elsewhere.
    forwardedFrom: {
      type: {
        _id: false,
        authorName: String, // original author's display name
        channelName: String, // human-readable origin ("#general" or a DM name)
        channelId: String, // source channel id (for the "view original" link)
        messageId: String, // source message id (to jump to it)
        threadId: String, // root thread id when the original was a reply
        channelType: String, // public | private | dm (helps the access hint)
      },
      default: null,
    },
    // Set when a channel member pins the message.
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Emoji reactions: one entry per emoji with the users who reacted.
    reactions: [
      {
        _id: false,
        emoji: String,
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      },
    ],
  },
  { timestamps: true }
);

// Paginate channel history newest-first by creation time.
messageSchema.index({ channel: 1, createdAt: -1 });

// Full-text search over message bodies (drives /api/search/messages).
messageSchema.index({ body: "text" });

// Supports `from:<user>` search (a sender's messages, newest first).
messageSchema.index({ author: 1, createdAt: -1 });
messageSchema.index({ mentionedUserIds: 1, createdAt: -1 });
messageSchema.index({ mentionsEveryone: 1, channel: 1, createdAt: -1 });
messageSchema.index({ threadRootAuthor: 1, createdAt: -1 });
messageSchema.index(
  { channel: 1, author: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  }
);
messageSchema.index(
  { channel: 1, author: 1, externalKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalKey: { $type: "string" },
    },
  }
);

messageSchema.methods.toPublicJSON = function () {
  const author = this.author;
  return {
    id: this._id.toString(),
    channelId: this.channel.toString(),
    body: this.body,
    createdAt: this.createdAt,
    editedAt: this.editedAt || null,
    kind: this.kind || "user",
    parentId: this.parentId ? this.parentId.toString() : null,
    externalKey: this.externalKey || null,
    automation: this.automation
      ? {
          source: this.automation.source || "api",
          status: this.automation.status || null,
          title: this.automation.title || null,
          threadKey: this.automation.threadKey || null,
          fields: (this.automation.fields || []).map((f) => ({
            name: f.name,
            value: f.value,
          })),
        }
      : null,
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
    forwardedFrom: this.forwardedFrom
      ? {
          authorName: this.forwardedFrom.authorName,
          channelName: this.forwardedFrom.channelName,
          channelId: this.forwardedFrom.channelId || null,
          messageId: this.forwardedFrom.messageId || null,
          threadId: this.forwardedFrom.threadId || null,
          channelType: this.forwardedFrom.channelType || null,
        }
      : null,
    pinnedAt: this.pinnedAt || null,
    pinnedBy: this.pinnedBy ? this.pinnedBy.toString() : null,
    reactions: (this.reactions || []).map((r) => ({
      emoji: r.emoji,
      users: r.users.map((u) => u.toString()),
    })),
    author:
      author && author.toPublicJSON
        ? author.toPublicJSON()
        : { id: author.toString() },
  };
};

export const Message = mongoose.model("Message", messageSchema);
