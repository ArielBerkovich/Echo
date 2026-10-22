import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

const CLEANUP_BATCH_SIZE = 500;

/** Remove saved-message references without materializing an entire channel's IDs. */
export async function removeSavedMessagesForChannel(userId, channelId) {
  const cursor = Message.find({ channel: channelId }).select({ _id: 1 }).lean().cursor();
  let batch = [];
  for await (const message of cursor) {
    batch.push(message._id);
    if (batch.length === CLEANUP_BATCH_SIZE) {
      await User.updateOne({ _id: userId }, { $pull: { savedMessages: { $in: batch } } });
      batch = [];
    }
  }
  if (batch.length) await User.updateOne({ _id: userId }, { $pull: { savedMessages: { $in: batch } } });
}
