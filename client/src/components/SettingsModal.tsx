import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { PASSWORD_RULE } from "../lib/password.js";
import { passwordPairSchema } from "../lib/formSchemas.js";
import {
  notifySupported,
  notifyPermission,
  notifyPref,
  setNotifyPref,
  requestNotifyPermission,
  showTestNotification,
} from "../lib/notify.js";

// User settings: profile picture, display name, and a copyable API token.
export default function SettingsModal({
  user,
  users = [],
  theme,
  themes = [],
  onSelectTheme,
  mode = "dark",
  onSelectMode,
  onUpdated,
  onClose,
  onReplayTour,
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const fileRef = useRef(null);
  const nameChanged = displayName.trim() !== user.displayName;

  async function onPickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Profile picture must be an image");
    setError(null);
    setBusy(true);
    try {
      const { attachments } = await api.uploadFiles([file]);
      const { user: updated } = await api.updateProfile({ avatarKey: attachments[0].key });
      setAvatarUrl(updated.avatarUrl);
      onUpdated(updated);
      flashSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.updateProfile({ avatarKey: null });
      setAvatarUrl(null);
      onUpdated(updated);
      flashSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!nameChanged) return;
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.updateProfile({ displayName: displayName.trim() });
      onUpdated(updated);
      flashSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }


  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <h2>Settings</h2>
        <button className="settings-close" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>
      <div className="settings-page-body">
        <div className="settings-page-inner">
        {/* Profile picture */}
        <section className="settings-section">
          <h3>Profile picture</h3>
          <div className="settings-avatar-row">
            <Avatar name={displayName} src={avatarUrl} size={72} />
            <div className="settings-avatar-actions">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {avatarUrl ? "Change" : "Upload"}
              </button>
              {avatarUrl && (
                <button type="button" className="link-danger" disabled={busy} onClick={removeAvatar}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Appearance / theme */}
        {themes.length > 0 && (
          <section className="settings-section">
            <h3>Appearance</h3>
            <p className="settings-hint">Pick a colour theme — it works in both light and dark.</p>
            <div className="mode-toggle" role="group" aria-label="Light or dark mode">
              <button
                type="button"
                className={`mode-option${mode === "light" ? " active" : ""}`}
                onClick={() => onSelectMode?.("light")}
                aria-pressed={mode === "light"}
              >
                ☀ Light
              </button>
              <button
                type="button"
                className={`mode-option${mode === "dark" ? " active" : ""}`}
                onClick={() => onSelectMode?.("dark")}
                aria-pressed={mode === "dark"}
              >
                ☾ Dark
              </button>
            </div>
            <div className="theme-grid">
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-card${theme === t.id ? " active" : ""}`}
                  onClick={() => onSelectTheme?.(t.id)}
                  aria-pressed={theme === t.id}
                >
                  <span className="theme-swatch">
                    {t.swatch.map((c, i) => (
                      <span key={i} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="theme-name">{t.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Display name */}
        <section className="settings-section">
          <h3>Display name</h3>
          <div className="settings-name-row">
            <input
              className="settings-input"
              value={displayName}
              maxLength={64}
              dir="auto"
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <button type="button" className="btn-primary" disabled={!nameChanged || busy} onClick={saveName}>
              Save
            </button>
          </div>
          <div className="settings-handle">@{user.username}</div>
        </section>

        {/* Password (self-service) — not available to the admin account. */}
        {!user.isAdmin && <ChangePassword />}

        {/* Admin — reset another user's password */}
        {user.isAdmin && <AdminPasswordReset users={users} currentUserId={user.id} />}

        {/* Desktop notifications */}
        <section className="settings-section">
          <h3>Desktop notifications</h3>
          <p className="settings-hint">
            Get a desktop alert for direct messages, @mentions, and VIP messages when Echo isn't
            focused.
          </p>
          <NotificationToggle />
        </section>

        {/* Walkthrough */}
        {onReplayTour && (
          <section className="settings-section">
            <h3>Walkthrough</h3>
            <p className="settings-hint">New here, or want a refresher? Replay the quick product tour.</p>
            <button type="button" className="btn-secondary replay-tour-btn" onClick={onReplayTour}>
              Replay walkthrough
            </button>
          </section>
        )}


        {error && <div className="error">{error}</div>}
        {saved && <div className="settings-saved">Saved ✓</div>}
        </div>
      </div>
    </div>
  );
}

// Enable/disable desktop notifications (requests browser permission on enable).
function NotificationToggle() {
  const [perm, setPerm] = useState(() => notifyPermission());
  const [on, setOn] = useState(() => notifyPref() && notifyPermission() === "granted");

  if (!notifySupported()) {
    return <p className="settings-hint">Your browser doesn't support desktop notifications.</p>;
  }
  if (perm === "denied") {
    return (
      <p className="settings-hint">
        Notifications are <strong>blocked</strong> for this site. Allow them in your browser's site
        settings, then reload. Also make sure your OS notification settings (and
        Do&nbsp;Not&nbsp;Disturb) allow your browser.
      </p>
    );
  }

  async function enable() {
    const p = await requestNotifyPermission();
    setPerm(p);
    if (p === "granted") {
      setNotifyPref(true);
      setOn(true);
      showTestNotification();
    }
  }
  function disable() {
    setNotifyPref(false);
    setOn(false);
  }

  return (
    <div className="notify-row">
      <button type="button" className={on ? "btn-secondary" : "btn-primary"} onClick={on ? disable : enable}>
        {on ? "Turn off notifications" : "Enable desktop notifications"}
      </button>
      {on && <span className="notify-on">On ✓</span>}
    </div>
  );
}

// Self-service: change your own password (requires the current one).
function ChangePassword() {
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: "onChange",
    resolver: zodResolver(passwordPairSchema({ currentPassword: true })),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const currentPasswordField = register("currentPassword");
  const newPasswordField = register("newPassword");
  const confirmPasswordField = register("confirmPassword");

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setDone(true);
      reset();
    } catch (err) {
      setError(err.message);
    }
  });

  return (
    <section className="settings-section">
      <h3>Password</h3>
      <p className="settings-hint">
        Change your password here. Forgot it and can't sign in? Your workspace admin can issue you a
        one-time password to set a new one.
      </p>
      <div className="pw-form">
        <input
          {...currentPasswordField}
          className="settings-input"
          type="password"
          placeholder="Current password"
          onChange={(e) => {
            setDone(false);
            setError(null);
            currentPasswordField.onChange(e);
          }}
        />
        {errors.currentPassword && <div className="error small">{errors.currentPassword.message}</div>}
        <input
          {...newPasswordField}
          className="settings-input"
          type="password"
          placeholder="New password"
          onChange={(e) => {
            setDone(false);
            setError(null);
            newPasswordField.onChange(e);
          }}
        />
        {errors.newPassword && <div className="error small">{errors.newPassword.message}</div>}
        <input
          {...confirmPasswordField}
          className="settings-input"
          type="password"
          placeholder="Confirm new password"
          onChange={(e) => {
            setDone(false);
            setError(null);
            confirmPasswordField.onChange(e);
          }}
        />
        {errors.confirmPassword && <div className="error small">{errors.confirmPassword.message}</div>}
        <div className="field-hint">{PASSWORD_RULE}</div>
        <button type="button" className="btn-primary" disabled={isSubmitting} onClick={submit}>
          {isSubmitting ? "Updating…" : "Update password"}
        </button>
      </div>
      {done && <div className="settings-saved">Password updated ✓</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

// Admin-only: pick a user and issue them a one-time password. The admin shares
// it; the user logs in with it and is forced to choose their own new password.
function AdminPasswordReset({ users, currentUserId }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [otp, setOtp] = useState(null);
  const [copied, setCopied] = useState(false);

  const candidates =
    query.trim() && !selected
      ? users
          .filter((u) => u.id !== currentUserId)
          .filter((u) => {
            const q = query.trim().toLowerCase();
            return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
          })
          .slice(0, 6)
      : [];

  function pick(u) {
    setSelected(u);
    setQuery(u.displayName);
    setOtp(null);
    setError(null);
  }
  function clearSelection() {
    setSelected(null);
    setQuery("");
    setOtp(null);
    setError(null);
    setCopied(false);
  }

  async function issue() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const { tempPassword } = await api.adminResetPassword(selected.id);
      setOtp(tempPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyOtp() {
    try {
      await navigator.clipboard.writeText(otp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user can select manually */
    }
  }

  return (
    <section className="settings-section">
      <h3>Admin · Issue a one-time password</h3>
      <p className="settings-hint">
        For a member who's locked out: issue a one-time password, share it with them, and they'll be
        prompted to set their own new password the next time they sign in.
      </p>

      <div className="admin-reset">
        <div className="admin-user-pick">
          <input
            className="settings-input"
            placeholder="Find a user by name or @username"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setOtp(null);
            }}
          />
          {selected && (
            <button type="button" className="link" onClick={clearSelection}>
              Clear
            </button>
          )}
          {candidates.length > 0 && (
            <div className="admin-user-results">
              {candidates.map((u) => (
                <button key={u.id} type="button" className="search-row" onClick={() => pick(u)}>
                  <Avatar name={u.displayName} src={u.avatarUrl} size={24} />
                  <span className="search-name">{u.displayName}</span>
                  <span className="search-handle">@{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && !otp && (
          <button type="button" className="btn-primary" disabled={busy} onClick={issue}>
            {busy ? "Issuing…" : `Issue one-time password for ${selected.displayName}`}
          </button>
        )}

        {otp && (
          <div className="otp-box">
            <div className="settings-saved">
              One-time password for {selected.displayName} — share it securely. They'll set a new
              password on next sign-in.
            </div>
            <div className="token-box">
              <code className="token-value">{otp}</code>
              <button type="button" className="btn-secondary" onClick={copyOtp}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </section>
  );
}
