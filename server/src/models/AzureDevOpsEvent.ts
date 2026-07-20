import mongoose from "mongoose";

/**
 * Idempotency log for Azure DevOps webhook events.
 *
 * Azure DevOps guarantees at-least-once delivery, so each event may be
 * received more than once. A unique index on `eventId` (the UUID ADO puts in
 * every payload) lets us detect and skip duplicates without re-processing.
 *
 * Records are kept for 30 days then automatically purged by the TTL index.
 */
const azureDevOpsEventSchema = new mongoose.Schema(
  {
    /** ADO event UUID — unique per logical event across all retries. */
    eventId: { type: String, required: true, unique: true, index: true },

    /** e.g. "build.complete", "git.pullrequest.merged", "git.pullrequest.commented" */
    eventType: { type: String, required: true, trim: true, maxlength: 64 },

    /**
     * Lifecycle status of this event:
     *  processing  – received, idempotency record inserted, handler running
     *  delivered   – all notifications sent successfully
     *  partial     – some notifications skipped (e.g. user not found in Echo)
     *  error       – handler threw; ADO will retry
     *  skipped     – event matched no handler or was intentionally ignored
     */
    status: {
      type: String,
      enum: ["processing", "delivered", "partial", "error", "skipped"],
      default: "processing",
    },

    /** Human-readable error detail when status === "error" | "partial". */
    errorMessage: { type: String, default: null, trim: true, maxlength: 500 },

    /** How many Echo users were notified. */
    recipientCount: { type: Number, default: 0 },

    /** Timestamp used by the TTL index for automatic expiry. */
    receivedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

// Auto-delete event records after 30 days to keep the collection bounded.
azureDevOpsEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 2592000 });

export const AzureDevOpsEvent = mongoose.model("AzureDevOpsEvent", azureDevOpsEventSchema);
