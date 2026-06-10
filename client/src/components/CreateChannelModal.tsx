import { useEffect, useRef, useState } from "react";

// "Create a channel" dialog with a name field and public/private choice.
export default function CreateChannelModal({ onCreate, onClose }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("public");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Live-normalize to the allowed channel-name characters (lowercase, no spaces).
  function handleName(value) {
    setName(value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, ""));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await onCreate(name.trim(), type);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create a channel</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Name</span>
            <div className="name-input">
              <span className="name-prefix">{type === "private" ? "🔒" : "#"}</span>
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => handleName(e.target.value)}
                placeholder="e.g. marketing"
                maxLength={64}
              />
            </div>
          </label>

          <div className="field">
            <span className="field-label">Visibility</span>
            <div className="visibility">
              <label className={`visibility-option ${type === "public" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="type"
                  checked={type === "public"}
                  onChange={() => setType("public")}
                />
                <div className="vo-body">
                  <div className="vo-title"># Public</div>
                  <div className="vo-desc">Anyone in the workspace can find and join.</div>
                </div>
              </label>
              <label className={`visibility-option ${type === "private" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="type"
                  checked={type === "private"}
                  onChange={() => setType("private")}
                />
                <div className="vo-body">
                  <div className="vo-title">🔒 Private</div>
                  <div className="vo-desc">Only invited members can view and join.</div>
                </div>
              </label>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || busy}>
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
