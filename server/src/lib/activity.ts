import { ActivityEvent } from "../models/ActivityEvent.js";

// A new account should not inherit notifications generated before it existed.
export async function clearUserActivity(userId, { session = null } = {}) {
  let eventsDelete = ActivityEvent.deleteMany({ recipient: userId });
  if (session) eventsDelete = eventsDelete.session(session);
  await eventsDelete;
}
