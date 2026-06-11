import { roomFor, userRoom } from "./lib/rooms.js";

// Holds the Socket.IO instance so REST routes can emit real-time events.
let io = null;

export function setIO(instance) {
  io = instance;
}

export function getIO() {
  return io;
}

export function emitToChannel(channelId, event, payload) {
  io?.to(roomFor(channelId)).emit(event, payload);
}

// Emit to a single user's personal room (all of their connected tabs).
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(userId)).emit(event, payload);
}

// Pull a user's connected sockets into a channel room so they receive its live
// messages immediately (e.g. right after being added to the channel).
export function joinUserToChannel(userId, channelId) {
  io?.in(userRoom(userId)).socketsJoin(roomFor(channelId));
}

// Remove a user's connected sockets from a channel room (e.g. after the creator
// removes them) so they stop receiving its live messages.
export function removeUserFromChannel(userId, channelId) {
  io?.in(userRoom(userId)).socketsLeave(roomFor(channelId));
}

// Broadcast to every connected socket (e.g. a new workspace-wide custom emoji).
export function emitAll(event, payload) {
  io?.emit(event, payload);
}
