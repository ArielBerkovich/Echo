import { ScheduledMessage } from "./models/ScheduledMessage.js";
import { Channel } from "./models/Channel.js";
import { deliverMessage } from "./deliver.js";

const TICK_MS = Math.max(250, Number(process.env.SCHEDULER_TICK_MS) || 15000); // check for due messages on a fixed cadence
const LEASE_MS = Math.max(TICK_MS * 2, 60_000);

async function dispatchDue() {
  // Claim each row atomically. This makes it safe for every server replica to
  // run the scheduler: only one replica owns a due message at a time.
  for (let i = 0; i < 50; i += 1) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const sm = await ScheduledMessage.findOneAndUpdate(
      {
        scheduledFor: { $lte: now },
        $or: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { $lte: now } }],
      },
      { $set: { dispatchLeaseUntil: leaseUntil } },
      { sort: { scheduledFor: 1 }, new: true }
    );
    if (!sm) break;

    const channel = await Channel.findById(sm.channel).catch(() => null);
    const canSend =
      channel &&
      (channel.type === "public" || channel.members.some((m) => m.equals(sm.author)));
    // Drop messages that can no longer be delivered (channel gone / left).
    if (!canSend) {
      await ScheduledMessage.deleteOne({ _id: sm._id, dispatchLeaseUntil: leaseUntil });
      continue;
    }
    try {
      await deliverMessage({
        channel,
        authorId: sm.author,
        body: sm.body,
        parentId: sm.parentId,
        attachments: sm.attachments,
      });
      await ScheduledMessage.deleteOne({ _id: sm._id, dispatchLeaseUntil: leaseUntil });
    } catch (err) {
      // Transient failure — leave it queued and retry on the next tick.
      console.error("scheduled dispatch failed (will retry):", err.message);
      await ScheduledMessage.updateOne(
        { _id: sm._id, dispatchLeaseUntil: leaseUntil },
        { $set: { dispatchLeaseUntil: null } }
      ).catch(() => {});
    }
  }
}

export function startScheduler() {
  let running = false;
  setInterval(async () => {
    if (running) return; // avoid overlapping runs
    running = true;
    try {
      await dispatchDue();
    } catch (err) {
      console.error("scheduler tick error:", err.message);
    } finally {
      running = false;
    }
  }, TICK_MS);
}
