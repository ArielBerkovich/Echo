import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 2,
      maxlength: 32,
      match: /^[a-z0-9_.-]+$/,
    },
    firstName: { type: String, trim: true, maxlength: 64 },
    lastName: { type: String, trim: true, maxlength: 64 },
    displayName: { type: String, required: true, trim: true, maxlength: 64 },
    passwordHash: { type: String, required: true },
    // Object-storage key for the user's uploaded profile picture (optional).
    avatarKey: { type: String, default: null },
    // The first registered user becomes the workspace admin.
    isAdmin: { type: Boolean, default: false },
    // Set when an admin issues a one-time password; the user must choose a new
    // password before they can use the app again.
    mustResetPassword: { type: Boolean, default: false },
    otpExpiresAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    // Has this user completed the first-run walkthrough? (Per-account, not
    // per-browser, so it follows them across devices.)
    onboarded: { type: Boolean, default: false },
    // Last time the user opened the Activity panel — used to mark reaction
    // activity read.
    activitySeenAt: { type: Date, default: null },
    // Activity entries the user explicitly dismissed from their feed.
    dismissedActivityIds: [{ type: String }],
    // Messages this user has saved ("save for later" / bookmark).
    savedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    // Other users this user has marked as VIP (their DMs get a pinned section).
    vips: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Never leak the password hash to clients.
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName,
    avatarUrl: this.avatarKey ? `/api/files/${this.avatarKey}` : null,
    isAdmin: !!this.isAdmin,
    mustResetPassword: !!this.mustResetPassword,
    onboarded: !!this.onboarded,
  };
};

export const User = mongoose.model("User", userSchema);
