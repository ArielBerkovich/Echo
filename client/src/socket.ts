import { io } from "socket.io-client";
import { getBackendUrl, getToken } from "./api.js";

let socket = null;

// Lazily create a single shared socket connection, authenticated with the JWT.
export function getSocket() {
  if (socket) return socket;
  socket = io(getBackendUrl() || undefined, {
    auth: { token: getToken() },
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
