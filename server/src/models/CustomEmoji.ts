import mongoose from "mongoose";

// Workspace-wide custom emoji: an uploaded image/GIF addressed by a :shortcode:.
const customEmojiSchema = new mongoose.Schema(
  {
    // Shortcode without the surrounding colons, e.g. "partyparrot".
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_-]{2,32}$/, "name must be 2-32 chars: a-z, 0-9, _ or -"],
    },
    key: { type: String, required: true }, // object-storage key
    contentType: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

customEmojiSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    url: `/api/files/${this.key}`,
    createdBy: this.createdBy?.toString?.() || null,
  };
};

export const CustomEmoji = mongoose.model("CustomEmoji", customEmojiSchema);
