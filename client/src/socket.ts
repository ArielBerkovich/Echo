import { io } from "socket.io-client";
import { getToken } from "./api.js";

let socket = null;

// Lazily create a single shared socket connection, authenticated with the JWT.
export function getSocket() {
  if (socket) return socket;
  socket = io({
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
