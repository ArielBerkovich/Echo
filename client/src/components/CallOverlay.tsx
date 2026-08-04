import { useEffect, useRef, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { api } from "../api.js";

export default function CallOverlay({ channel, onClose }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const closingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.getCallToken(channel.id)
      .then((result) => { if (!cancelled) setSession(result); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not join the call"); });
    return () => { cancelled = true; };
  }, [channel.id, retry]);

  function close() {
    closingRef.current = true;
    onClose?.();
  }

  function disconnected(reason) {
    if (closingRef.current) return;
    const detail = typeof reason === "string" ? reason : reason?.reason || "unknown reason";
    setError(`The call disconnected (${detail}).`);
  }

  return (
    <div className="call-overlay" role="dialog" aria-label="Voice and video call">
      <div className="call-surface">
        <div className="call-heading">
          <div>
            <strong>{channel.type === "dm" ? channel.dmName || "Direct message" : `#${channel.name}`}</strong>
            <span>Voice and video call</span>
          </div>
          <button type="button" className="call-close" onClick={close} aria-label="Close call">×</button>
        </div>
        {error ? (
          <div className="call-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn-secondary" onClick={() => { closingRef.current = false; setError(""); setSession(null); setRetry((value) => value + 1); }}>Retry</button>
            <button type="button" className="btn-primary" onClick={close}>Close</button>
          </div>
        ) : session ? (
          <LiveKitRoom
            token={session.token}
            serverUrl={session.serverUrl}
            connect
            // Join before requesting devices. Mobile browsers can abort the
            // whole LiveKit connection when getUserMedia runs during startup;
            // the in-call controls can enable mic/camera after the room joins.
            audio={false}
            video={false}
            onDisconnected={disconnected}
            onError={(err) => setError(err.message || "The call could not connect")}
            data-lk-theme="default"
          >
            <VideoConference />
          </LiveKitRoom>
        ) : <div className="call-loading" role="status">Connecting…</div>}
      </div>
    </div>
  );
}
