import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  tokenHash: { type: String, required: true, unique: true, index: true },
  tokenCiphertext: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", default: null },
  active: { type: Boolean, default: true },
  notify: {
    buildStarted: { type: Boolean, default: true },
    buildSucceeded: { type: Boolean, default: true },
    buildFailed: { type: Boolean, default: true },
    buildUnstable: { type: Boolean, default: true },
    buildAborted: { type: Boolean, default: true },
  },
  lastReceivedAt: { type: Date, default: null },
  lastError: { type: String, default: null, maxlength: 500 },
}, { timestamps: true });

schema.methods.toPublicJSON = function () {
  return { id: this._id.toString(), name: this.name, channelId: this.channel ? this.channel.toString() : null, active: !!this.active, notify: this.notify, lastReceivedAt: this.lastReceivedAt, lastError: this.lastError, createdAt: this.createdAt };
};

export const JenkinsIntegration = mongoose.model("JenkinsIntegration", schema);
