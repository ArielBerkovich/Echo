import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  handle: { type: String, required: true, lowercase: true, trim: true, minlength: 2, maxlength: 32, match: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ },
  description: { type: String, default: "", trim: true, maxlength: 280 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });
groupSchema.index({ handle: 1 }, { unique: true });
groupSchema.index({ deletedAt: 1, archivedAt: 1, name: 1 });
groupSchema.methods.toPublicJSON = function () {
  return { id: this._id.toString(), provider: "echo", name: this.name, handle: this.handle, description: this.description || "", ownerId: this.owner.toString(), createdBy: this.createdBy.toString(), archivedAt: this.archivedAt || null, deletedAt: this.deletedAt || null };
};

const membershipSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["owner", "member"], default: "member" },
}, { timestamps: true });
membershipSchema.index({ group: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1, group: 1 });

const channelSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
channelSchema.index({ group: 1, channel: 1 }, { unique: true });

export const Group = mongoose.model("Group", groupSchema);
export const GroupMembership = mongoose.model("GroupMembership", membershipSchema);
export const GroupChannel = mongoose.model("GroupChannel", channelSchema);
