import { isSameMinute } from "./time.js";

// A message may share the previous message's header only when both are normal
// messages by the same author in the same local calendar minute.
export function shouldGroupWithPreviousMessage(previous, message) {
  return Boolean(
    previous
    && previous.kind !== "system"
    && message.kind !== "system"
    && message.author?.id === previous.author?.id
    && isSameMinute(previous.createdAt, message.createdAt)
  );
}
