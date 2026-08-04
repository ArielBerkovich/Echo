import { io } from "socket.io-client";
import { getBackendUrl, getToken } from "./api.js";

let socket = null;

function refreshSocketAuth() {
  if (socket) socket.auth = { token: getToken() };
}

// Lazily create a single shared socket connection, authenticated with the JWT.
export function getSocket() {
  if (socket) {
    refreshSocketAuth();
    return socket;
  }
  socket = io(getBackendUrl() || undefined, {
    auth: { token: getToken() },
    autoConnect: true,
    // The Compose/Helm server can run multiple replicas. WebSocket-only
    // transport avoids Socket.IO's polling handshake requiring sticky
    // sessions at the client proxy.
    transports: ["websocket"],
  });
  // A session token can be replaced without recreating the page (login,
  // password change, SSO callback). Always use the latest token when the
  // manager starts a new handshake after an outage.
  socket.io.on("reconnect_attempt", refreshSocketAuth);
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.io.off("reconnect_attempt", refreshSocketAuth);
    socket.disconnect();
    socket = null;
  }
}
