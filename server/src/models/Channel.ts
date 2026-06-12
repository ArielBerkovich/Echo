import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 1,
      maxlength: 64,
      // Channel names are lowercase and contain no spaces.
      match: /^[a-z0-9_-]+$/,
    },
    type: { type: String, enum: ["public", "private", "dm"], default: "public" },
    // Short one-liner shown in the header; longer "about" text for the details panel.
    topic: { type: String, default: "", trim: true, maxlength: 250 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Users who have removed this DM from their sidebar (re-shown on a new message).
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

channelSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    type: this.type,
    topic: this.topic || "",
    description: this.description || "",
    memberCount: this.members.length,
    members: this.members.map((m) => m.toString()),
    createdBy: this.createdBy.toString(),
    createdAt: this.createdAt,
    isArchived: this.isArchived,
  };
};

export const Channel = mongoose.model("Channel", channelSchema);
