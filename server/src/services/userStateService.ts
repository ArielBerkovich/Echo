import { Read } from "../models/Read.js";
import { ThreadFollow } from "../models/ThreadFollow.js";
import { User } from "../models/User.js";
import { emitToUser } from "../realtime.js";

export type UserStateActor = string | { toString(): string };

export async function toggleSavedMessage({ userId, messageId, saved }: {
  userId: UserStateActor;
  messageId: UserStateActor;
  saved?: boolean;
}) {
  const user = await User.findById(userId);
  if (!user) return null;

  const index = user.savedMessages.findIndex((id) => id.equals(messageId));
  const next = saved === undefined ? index < 0 : saved;
  if (next && index < 0) user.savedMessages.push(messageId);
  if (!next && index >= 0) user.savedMessages.splice(index, 1);
  await user.save();
  return { saved: next };
}

export async function markRead({ userId, channelId, threadId = null }: {
  userId: UserStateActor;
  channelId: UserStateActor;
  threadId?: UserStateActor | null;
}) {
  const thread = threadId || null;
  await Read.updateOne(
    { user: userId, channel: channelId, thread },
    { $set: { lastReadAt: new Date() } },
    { upsert: true },
  );
  return { thread };
}

export async function getThreadFollow({ userId, threadId }: {
  userId: UserStateActor;
  threadId: UserStateActor;
}) {
  const preference = await ThreadFollow.findOne({ user: userId, thread: threadId }).select("following").lean();
  return {
    following: !!preference && preference.following !== false,
    muted: preference?.following === false,
  };
}

export async function setThreadFollow({ userId, threadId, channelId, following }: {
  userId: UserStateActor;
  threadId: UserStateActor;
  channelId: UserStateActor;
  following: boolean | null;
}) {
  if (following === null) {
    await ThreadFollow.deleteOne({ user: userId, thread: threadId });
  } else {
    await ThreadFollow.updateOne(
      { user: userId, thread: threadId },
      {
        $set: { following },
        $setOnInsert: { user: userId, thread: threadId, channel: channelId },
      },
      { upsert: true },
    );
  }

  const result = {
    following: following === true,
    muted: following === false,
  };
  emitToUser(String(userId), "thread:follow", {
    threadId: String(threadId),
    ...result,
  });
  return result;
}
