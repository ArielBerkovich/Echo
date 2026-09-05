import { Read } from "../models/Read.js";
import { User } from "../models/User.js";

// Freeze legacy state before any authenticated request can advance a read
// marker. Concurrent first requests all use the same winning snapshot.
export async function ensureActivityReadBaseline(user) {
  if (user.activityReadBaseline) return;
  const reads = await Read.find({ user: user._id }, { channel: 1, thread: 1, lastReadAt: 1 }).lean();
  const updated = await User.findOneAndUpdate(
    { _id: user._id, activityReadBaseline: null },
    { $set: { activityReadBaseline: { reads, seenAt: user.activitySeenAt } } },
    { new: true }
  );
  user.activityReadBaseline = updated?.activityReadBaseline
    || (await User.findById(user._id)).activityReadBaseline;
}
