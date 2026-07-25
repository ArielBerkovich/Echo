import mongoose from "mongoose";

/**
 * Aggregation buffer for Azure DevOps pull-request comment events.
 *
 * When a comment webhook arrives, Echo either creates a new buffer or appends
 * to an existing unflushed one.  A background worker flushes expired buffers
 * as a single digest DM to the PR author.
 *
 * Deduplication within the buffer is on `commentId` (ADO thread comment id).
 *
 * Records are auto-deleted 48 hours after the window expires so the collection
 * never grows unbounded even if the flush worker fails permanently.
 */
const commentAggBufferSchema = new mongoose.Schema(
  {
    /** ADO pull request number (string for compound uniqueness with repoName). */
    prId: { type: String, required: true, trim: true },

    /** ADO repository name — disambiguates PRs across repos. */
    repoName: { type: String, required: true, trim: true, maxlength: 128 },

    /** PR title — captured at first comment, shown in the digest header. */
    prTitle: { type: String, default: "", trim: true, maxlength: 256 },

    /** Direct link to the pull request in Azure DevOps. */
    prUrl: { type: String, default: "", trim: true, maxlength: 1024 },

    /** Echo user who authored the PR and will receive the digest DM. */
    echoAuthorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * When the aggregation window closes and the buffer becomes eligible for
     * flushing.  The flush worker queries: { flushed: false, windowExpiresAt: { $lte: now } }.
     */
    windowExpiresAt: { type: Date, required: true },

    /** True once the digest DM has been delivered successfully. */
    flushed: { type: Boolean, default: false, index: true },

    /** Buffered comments, deduplicated by commentId. */
    comments: [
      {
        _id: false,
        /** ADO thread comment ID — used for within-buffer deduplication. */
        commentId: { type: Number, required: true },
        content: { type: String, default: "", trim: true, maxlength: 2000 },
        authorDisplayName: { type: String, default: "", trim: true, maxlength: 128 },
        authorEmail: { type: String, default: "", trim: true, maxlength: 256 },
        /** ADO event UUID — lets us trace which webhook event added this entry. */
        eventId: { type: String, required: true, trim: true },
        receivedAt: { type: Date, default: () => new Date() },
      },
    ],
  },
  { timestamps: true }
);

// Compound index so the flush worker can efficiently find per-PR, per-author buffers.
commentAggBufferSchema.index({ prId: 1, repoName: 1, echoAuthorUserId: 1, flushed: 1 });

// Auto-delete flushed (and stuck unflushed) buffers 48 hours after window expiry.
// expireAfterSeconds is added to the date stored in windowExpiresAt.
commentAggBufferSchema.index({ windowExpiresAt: 1 }, { expireAfterSeconds: 172800 });

export const CommentAggBuffer = mongoose.model("CommentAggBuffer", commentAggBufferSchema);
