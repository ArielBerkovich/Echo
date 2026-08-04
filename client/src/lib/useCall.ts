import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";

// Owns the short-lived DM call lifecycle. LiveKit owns media; Echo only
// announces incoming calls and relays declines.
export function useCall(user, onNotice, activeChannel) {
  const [callChannel, setCallChannel] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCallIds, setActiveCallIds] = useState(() => new Set());
  const callChannelRef = useRef(null);

  useEffect(() => {
    callChannelRef.current = callChannel;
  }, [callChannel]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onIncoming = (payload) => {
      if (
        payload?.channel?.type !== "dm" ||
        !payload.channel.id ||
        payload.from?.id === user.id ||
        callChannelRef.current
      ) return;
      setIncomingCall(payload);
    };
    const onDeclined = (payload) => {
      if (!payload?.channelId) return;
      setCallChannel((current) => (current?.id === payload.channelId ? null : current));
      onNotice?.(`${payload.from?.displayName || "The participant"} declined the call`);
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:declined", onDeclined);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:declined", onDeclined);
    };
  }, [user, onNotice]);

  const refreshCallStatus = useCallback(async (channel) => {
    if (!channel || channel.type !== "dm") return;
    try {
      const result = await api.getCallStatus(channel.id);
      setActiveCallIds((current) => {
        const next = new Set(current);
        if (result.active) next.add(channel.id);
        else next.delete(channel.id);
        return next;
      });
    } catch {
      // Availability is best-effort; the call action can still request a token.
    }
  }, []);

  useEffect(() => {
    if (!user || activeChannel?.type !== "dm") return undefined;
    refreshCallStatus(activeChannel);
    const timer = window.setInterval(() => refreshCallStatus(activeChannel), 4000);
    return () => window.clearInterval(timer);
  }, [user, activeChannel, refreshCallStatus]);

  const startCall = useCallback((channel) => {
    if (channel?.type === "dm") {
      setActiveCallIds((current) => new Set(current).add(channel.id));
      setCallChannel(channel);
    }
  }, []);

  const closeCall = useCallback(() => setCallChannel(null), []);

  const acceptCall = useCallback(() => {
    setCallChannel(incomingCall?.channel || null);
    setIncomingCall(null);
  }, [incomingCall]);

  const declineCall = useCallback(() => {
    if (incomingCall?.channel?.id && incomingCall.from?.id) {
      getSocket().emit("call:decline", {
        channelId: incomingCall.channel.id,
        to: incomingCall.from.id,
      });
    }
    setIncomingCall(null);
  }, [incomingCall]);

  const isCallActive = useCallback((channelId) => activeCallIds.has(channelId), [activeCallIds]);

  return { callChannel, incomingCall, isCallActive, startCall, closeCall, acceptCall, declineCall };
}
