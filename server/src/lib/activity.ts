import { ActivityEvent } from "../models/ActivityEvent.js";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

const ACTIVITY_WINDOW_DAYS = 30;

// A new account should not inherit activity generated before it existed. The
// feed contains both stored events and message-derived entries, so clear both
// sources before issuing the first session token.
export async function clearUserActivity(userId, { session = null } = {}) {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let visibleQuery = Channel.find(
    { isArchived: { $ne: true }, $or: [{ type: "public" }, { members: userId }] },
    { _id: 1, members: 1 }
  );
  if (session) visibleQuery = visibleQuery.session(session);
  const visible = await visibleQuery;
  const visibleChannelIds = visible.map((channel) => channel._id);
  const memberChannelIds = visible
    .filter((channel) => channel.members.some((member) => member.equals(userId)))
    .map((channel) => channel._id);

  let messagesQuery = Message.find(
    {
      author: { $ne: userId },
      createdAt: { $gte: since },
      channel: { $in: visibleChannelIds },
      $or: [
        { mentionedUserIds: userId },
        { channel: { $in: memberChannelIds }, mentionsEveryone: true },
        { threadRootAuthor: userId },
      ],
    },
    { _id: 1 }
  );
  if (session) messagesQuery = messagesQuery.session(session);
  const messages = await messagesQuery;
  const dismissedIds = messages.map((message) => `message:${message._id.toString()}`);

  let eventsDelete = ActivityEvent.deleteMany({ recipient: userId });
  if (session) eventsDelete = eventsDelete.session(session);
  const updates = [eventsDelete];
  if (dismissedIds.length) {
    let userUpdate = User.updateOne(
      { _id: userId },
      {
        $set: { activitySeenAt: new Date() },
        $addToSet: { dismissedActivityIds: { $each: dismissedIds } },
      }
    );
    if (session) userUpdate = userUpdate.session(session);
    updates.push(userUpdate);
  } else {
    let userUpdate = User.updateOne({ _id: userId }, { $set: { activitySeenAt: new Date() } });
    if (session) userUpdate = userUpdate.session(session);
    updates.push(userUpdate);
  }
  await Promise.all(updates);
}
