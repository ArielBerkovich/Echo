import { useEffect, useState } from "react";
import { api } from "../api.js";

// Upload an image/GIF and register it as a :shortcode: custom emoji.
export default function AddEmojiModal({ existing = [], onCreated, onClose }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Build (and clean up) a local preview URL for the chosen file.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const cleanName = name.trim().replace(/^:|:$/g, "").toLowerCase();
  const nameValid = /^[a-z0-9_-]{2,32}$/.test(cleanName);
  const taken = existing.some((e) => e.name === cleanName);
  const canSave = nameValid && !taken && file && !saving;

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (f && !f.type.startsWith("image/")) {
      setError("Custom emoji must be an image (PNG, GIF, etc.)");
      return;
    }
    setError(null);
    setFile(f || null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { emoji } = await api.createEmoji(cleanName, file);
      onCreated?.(emoji);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add custom emoji</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit}>
          <div className="emoji-form-row">
            <label className="emoji-drop">
              {preview ? (
                <img src={preview} alt="preview" />
              ) : (
                <span className="emoji-drop-hint">Choose image / GIF</span>
              )}
              <input type="file" accept="image/*" hidden onChange={pickFile} />
            </label>

            <div className="emoji-form-fields">
              <label className="emoji-name-label">Shortcode</label>
              <div className="emoji-name-input">
                <span>:</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="party-parrot"
                  autoFocus
                  maxLength={34}
                />
                <span>:</span>
              </div>
              <div className="emoji-name-hint">
                {taken ? (
                  <span className="bad">":{cleanName}:" already exists</span>
                ) : name && !nameValid ? (
                  <span className="bad">2–32 chars: letters, numbers, _ or -</span>
                ) : (
                  <span>Type :{cleanName || "name"}: in a message to use it.</span>
                )}
              </div>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              {saving ? "Saving…" : "Add emoji"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
