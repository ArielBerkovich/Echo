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
    // RHSSO identities are keyed by issuer + subject. Local accounts have
    // neither field, so an SSO login can never take over an existing account
    // merely by presenting the same username.
    rhssoIssuer: { type: String, default: undefined },
    rhssoSubject: { type: String, default: undefined },
    // Records how this Echo person was originally created. A migrated local
    // account keeps "local" here even when its current login becomes RHSSO.
    authOrigin: { type: String, enum: ["local", "rhsso"], default: "local" },
    // Identity replacement is intentionally one-time.
    migratedAt: { type: Date, default: null },
    // Object-storage key for the user's uploaded profile picture (optional).
    avatarKey: { type: String, default: null },
    // Built-in avatar asset used by service identities such as Azure DevOps.
    avatarUrlOverride: { type: String, default: null },
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
    // Legacy Activity-panel timestamp, retained for upgrade compatibility.
    activitySeenAt: { type: Date, default: null },
    // Frozen legacy read markers preserve read state when upgrading to item reads.
    activityReadBaseline: { type: mongoose.Schema.Types.Mixed, default: null },
    // Activity entries the user explicitly dismissed from their feed.
    dismissedActivityIds: [{ type: String }],
    // Messages this user has saved ("save for later" / bookmark).
    savedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    // Other users this user has marked as VIP (their DMs get a pinned section).
    vips: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Channels this user has marked for quick access in the Starred section.
    starredChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: "Channel" }],
  },
  { timestamps: true }
);

userSchema.index({ rhssoIssuer: 1, rhssoSubject: 1 }, { unique: true, sparse: true });

// Never leak the password hash to clients.
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName,
    avatarUrl: this.avatarUrlOverride || (this.avatarKey ? `/api/files/${this.avatarKey}` : null),
    isAdmin: !!this.isAdmin,
    // SSO credentials are managed by the identity provider, not Echo.
    canChangePassword: this.authOrigin !== "rhsso" && !this.rhssoSubject,
    mustResetPassword: !!this.mustResetPassword,
    onboarded: !!this.onboarded,
  };
};

export const User = mongoose.model("User", userSchema);
