import { ScheduledMessage } from "./models/ScheduledMessage.js";
import { Channel } from "./models/Channel.js";
import { deliverMessage } from "./deliver.js";

const TICK_MS = 15000; // check for due messages every 15s

async function dispatchDue() {
  const due = await ScheduledMessage.find({ scheduledFor: { $lte: new Date() } }).limit(50);
  for (const sm of due) {
    const channel = await Channel.findById(sm.channel).catch(() => null);
    const canSend =
      channel &&
      (channel.type === "public" || channel.members.some((m) => m.equals(sm.author)));
    // Drop messages that can no longer be delivered (channel gone / left).
    if (!canSend) {
      await ScheduledMessage.deleteOne({ _id: sm._id });
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
      await ScheduledMessage.deleteOne({ _id: sm._id });
    } catch (err) {
      // Transient failure — leave it queued and retry on the next tick.
      console.error("scheduled dispatch failed (will retry):", err.message);
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
