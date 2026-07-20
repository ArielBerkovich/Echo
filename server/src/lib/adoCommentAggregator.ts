import { CommentAggBuffer } from "../models/CommentAggBuffer.js";
import { AzureDevOpsConfig } from "../models/AzureDevOpsConfig.js";
import { Channel } from "../models/Channel.js";
import { ensureDmChannel } from "./dms.js";
import { deliverMessage } from "../deliver.js";
import { renderCommentDigest } from "./adoMessageRenderer.js";

/** A single comment as extracted from the ADO webhook payload. */
export interface IncomingComment {
  commentId: number;
  content: string;
  authorDisplayName: string;
  authorEmail: string;
  eventId: string;
  prId: string;
  repoName: string;
  prTitle: string;
  prUrl: string;
  /** Echo ObjectId of the PR author who will receive the digest. */
  echoAuthorUserId: string;
}

/**
 * Receive a single comment event and place it in the appropriate aggregation
 * buffer.  Creates a new buffer if none exists; appends to an active one.
 *
 * Edge-case handling:
 *  - Duplicate commentId within the same buffer → silently ignored.
 *  - Window already expired but buffer not yet flushed → extend by half the
 *    configured window (grace period) so the flush worker gets a chance to
 *    drain before a race creates a second buffer.
 */
export async function bufferComment(comment: IncomingComment): Promise<void> {
  const config = await AzureDevOpsConfig.findOne().lean();
  const windowSeconds = config?.commentAggregationWindowSeconds ?? 120;
  const now = new Date();

  // Look for an existing unflushed buffer for this PR / author pair.
  const existing = await CommentAggBuffer.findOne({
    prId: comment.prId,
    repoName: comment.repoName,
    echoAuthorUserId: comment.echoAuthorUserId,
    flushed: false,
  });

  if (existing) {
    // Deduplication: skip if this commentId is already buffered.
    const alreadyBuffered = existing.comments.some(
      (c: { commentId: number }) => c.commentId === comment.commentId
    );
    if (alreadyBuffered) return;

    // Grace-period extension if the window has already lapsed.
    if (existing.windowExpiresAt <= now) {
      existing.windowExpiresAt = new Date(now.getTime() + (windowSeconds / 2) * 1000);
    }

    existing.comments.push({
      commentId: comment.commentId,
      content: comment.content,
      authorDisplayName: comment.authorDisplayName,
      authorEmail: comment.authorEmail,
      eventId: comment.eventId,
      receivedAt: now,
    });
    await existing.save();
    return;
  }

  // No existing buffer — create a new one.
  await CommentAggBuffer.create({
    prId: comment.prId,
    repoName: comment.repoName,
    prTitle: comment.prTitle,
    prUrl: comment.prUrl,
    echoAuthorUserId: comment.echoAuthorUserId,
    windowExpiresAt: new Date(now.getTime() + windowSeconds * 1000),
    flushed: false,
    comments: [
      {
        commentId: comment.commentId,
        content: comment.content,
        authorDisplayName: comment.authorDisplayName,
        authorEmail: comment.authorEmail,
        eventId: comment.eventId,
        receivedAt: now,
      },
    ],
  });
}

/**
 * Flush all aggregation buffers whose aggregation window has expired.
 *
 * Called on a fixed cadence by the ADO scheduler.  Each flush:
 *  1. Finds expired, unflushed buffers (up to 20 per tick to avoid blocking).
 *  2. Renders a comment-digest Markdown message.
 *  3. Delivers a DM to the PR author via the existing deliverMessage() path.
 *  4. Marks the buffer as flushed.
 *
 * Failures leave `flushed=false` so the next tick retries automatically.
 */
export async function flushExpiredCommentBuffers(): Promise<void> {
  const config = await AzureDevOpsConfig.findOne().lean();
  if (!config) return; // Not configured; skip silently.

  const now = new Date();
  const expired = await CommentAggBuffer.find({
    flushed: false,
    windowExpiresAt: { $lte: now },
  }).limit(20);

  for (const buffer of expired) {
    try {
      const dmChannel = await ensureDmChannel(
        config.botUserId,
        buffer.echoAuthorUserId
      );
      if (!dmChannel) {
        console.warn("[ado] flush: DM channel not found for user", buffer.echoAuthorUserId.toString());
        continue;
      }

      const comments = (buffer.comments as Array<{
        commentId: number;
        content: string;
        authorDisplayName: string;
        authorEmail: string;
        eventId: string;
        receivedAt: Date;
      }>).map((c) => ({
        authorDisplayName: c.authorDisplayName,
        content: c.content,
      }));

      const body = renderCommentDigest(
        buffer.prId,
        buffer.prTitle,
        buffer.prUrl,
        buffer.repoName,
        comments
      );

      // Use the buffer _id as idempotency key so a restart doesn't re-deliver.
      await deliverMessage({
        channel: dmChannel,
        authorId: config.botUserId,
        body,
        parentId: null,
        attachments: [],
        idempotencyKey: `ado-comment-digest-${buffer._id.toString()}`,
      });

      buffer.flushed = true;
      await buffer.save();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ado] flush: failed to deliver comment digest:", message);
      // Leave flushed=false; the next scheduler tick will retry.
    }
  }
}
