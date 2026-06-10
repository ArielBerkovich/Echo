import { useState } from "react";
import { api } from "../api.js";
import Logo from "./Logo.js";

// Shown (blocking) right after a user signs in with an admin-issued one-time
// password: they must choose their own new password before using the app.
export default function ForcePasswordReset({ user, onDone, onCancel }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const valid = next.length >= 6 && next === confirm;

  async function submit(e) {
    e?.preventDefault();
    setError(null);
    if (next.length < 6) return setError("Password must be at least 6 characters");
    if (next !== confirm) return setError("Passwords don't match");
    setBusy(true);
    try {
      // No current password needed — the account is on a one-time password and
      // the user is already authenticated with it.
      const { user: updated } = await api.changePassword(undefined, next);
      onDone(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="force-reset">
      <form className="force-reset-card" onSubmit={submit}>
        <Logo size={40} />
        <h2>Set a new password</h2>
        <p>
          Welcome back{user?.displayName ? `, ${user.displayName}` : ""}. You signed in with a
          one-time password — choose a new password to finish.
        </p>
        <input
          className="settings-input"
          type="password"
          placeholder="New password (min 6 chars)"
          value={next}
          autoFocus
          onChange={(e) => setNext(e.target.value)}
        />
        <input
          className="settings-input"
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!valid || busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
        {error && <div className="error">{error}</div>}
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Sign out instead
          </button>
        )}
      </form>
    </div>
  );
}
