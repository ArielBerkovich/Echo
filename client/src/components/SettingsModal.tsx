import { useEffect, useState } from "react";
import { Code2Icon, PaletteIcon, UserRoundIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { MAX_DISPLAY_NAME_LENGTH } from "../lib/profile.js";
import ApiDocsPage from "./ApiDocsPage.js";
import ProfilePictureDialog from "./ProfilePictureDialog.js";
import { PASSWORD_RULE } from "../lib/password.js";
import { passwordPairSchema } from "../lib/formSchemas.js";
import { uploadSizeError } from "../lib/uploads.js";
import {
  notifySupported,
  notifyPermission,
  notifyPref,
  setNotifyPref,
  requestNotifyPermission,
  showTestNotification,
} from "../lib/notify.js";

const SETTINGS_TABS = [
  { id: "account", label: "Account", Icon: UserRoundIcon },
  { id: "appearance", label: "Appearance", Icon: PaletteIcon },
  { id: "api", label: "API", Icon: Code2Icon },
];

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
  branding = { enabled: false, name: "Echo", imageUrl: null },
  onBrandingUpdated,
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("account");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [brandingName, setBrandingName] = useState(branding.name || "Echo");
  const [brandingEnabled, setBrandingEnabled] = useState(!!branding.enabled);
  const [brandingImageUrl, setBrandingImageUrl] = useState(branding.imageUrl || null);
  const [brandingImageFile, setBrandingImageFile] = useState(null);
  const [brandingDialogOpen, setBrandingDialogOpen] = useState(false);

  const nameChanged = displayName.trim() !== user.displayName;

  useEffect(() => {
    setDisplayName(user.displayName);
    setAvatarUrl(user.avatarUrl || null);
  }, [user.displayName, user.avatarUrl]);

  useEffect(() => {
    setBrandingName(branding.name || "Echo");
    setBrandingEnabled(!!branding.enabled);
    setBrandingImageUrl(branding.imageUrl || null);
  }, [branding.enabled, branding.imageUrl, branding.name]);

  function onAvatarFileSelected(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Profile picture must be an image");
    const sizeError = uploadSizeError([file], undefined, "Profile pictures");
    if (sizeError) return setError(sizeError);
    setError(null);
    setAvatarFile(file);
  }

  async function saveAvatar(file) {
    setBusy(true);
    try {
      const { attachments } = await api.uploadFiles([file]);
      const { user: updated } = await api.updateProfile({ avatarKey: attachments[0].key });
      setAvatarUrl(updated.avatarUrl);
      onUpdated(updated);
      setAvatarFile(null);
      setAvatarDialogOpen(false);
      flashSaved();
    } catch (err) {
      setError(err.message);
      throw err;
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

  function onBrandingImageSelected(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Organization image must be an image");
    const sizeError = uploadSizeError([file], undefined, "Organization images");
    if (sizeError) return setError(sizeError);
    setError(null);
    setBrandingImageFile(file);
  }

  async function saveBrandingImage(file) {
    setBusy(true);
    try {
      const { attachments } = await api.uploadFiles([file]);
      const result = await api.updateWorkspaceBranding({ imageKey: attachments[0].key });
      setBrandingImageUrl(result.branding.imageUrl);
      onBrandingUpdated?.(result.branding);
      setBrandingImageFile(null);
      setBrandingDialogOpen(false);
      flashSaved();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveBrandingSettings() {
    const nextName = brandingName.trim();
    if (!nextName || nextName.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(`Organization name must be 1-${MAX_DISPLAY_NAME_LENGTH} characters`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.updateWorkspaceBranding({ name: nextName, enabled: brandingEnabled });
      onBrandingUpdated?.(result.branding);
      flashSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!nameChanged) return;
    const nextName = displayName.trim();
    if (!nextName || nextName.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(`Display name must be 1-${MAX_DISPLAY_NAME_LENGTH} characters`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.updateProfile({ displayName: nextName });
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
    <div className="settings-page" data-testid="settings-page">
      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings categories">
          <div className="settings-nav-account">
            <span className="settings-nav-username">@{user.username}</span>
          </div>
          <nav className="settings-nav-list">
            {SETTINGS_TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" className={`settings-nav-item${activeTab === id ? " active" : ""}`} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main className={`settings-content settings-content-${activeTab}`}>
          {activeTab === "account" && <>
            <section className="settings-section settings-profile-section">
              <h3>Profile</h3>
              <div className="settings-profile-fields">
                <div className="settings-profile-field">
                  <div className="settings-profile-field-label">Profile picture</div>
                <div className="settings-avatar-row">
                    <Avatar name={displayName} src={avatarUrl} size={64} />
                  <div className="settings-avatar-actions">
                    <button type="button" className="btn-secondary" data-testid="settings-avatar-button" disabled={busy} onClick={() => setAvatarDialogOpen(true)}>{avatarUrl ? "Change" : "Upload"}</button>
                    {avatarUrl && <button type="button" className="link-danger" data-testid="settings-avatar-remove" disabled={busy} onClick={removeAvatar}>Remove</button>}
                  </div>
                </div>
                </div>
                <div className="settings-profile-field">
                  <div className="settings-profile-field-label">Display name</div>
                <div className="settings-name-row">
                  <input className="settings-input" data-testid="settings-display-name" value={displayName} maxLength={MAX_DISPLAY_NAME_LENGTH} dir="auto" onChange={(e) => setDisplayName(e.target.value)} />
                  <button type="button" className="btn-primary" disabled={!nameChanged || busy} onClick={saveName}>Save</button>
                </div>
                </div>
              </div>
            </section>
            {user.isAdmin && <section className="settings-section settings-branding-section" data-testid="organization-branding">
                <h3>Organization branding</h3>
                <p className="settings-hint">Use your organization’s image and name at the top of the primary navigation for everyone.</p>
                <div className="settings-avatar-row">
                  <Avatar name={brandingName} src={brandingImageUrl} size={64} />
                  <div className="settings-avatar-actions">
                    <button type="button" className="btn-secondary" data-testid="organization-image-button" disabled={busy} onClick={() => setBrandingDialogOpen(true)}>{brandingImageUrl ? "Change" : "Upload"}</button>
                  </div>
                </div>
                <label className="settings-branding-toggle">
                  <input type="checkbox" checked={brandingEnabled} onChange={(event) => setBrandingEnabled(event.target.checked)} disabled={busy} />
                  <span>Show organization branding in the primary navigation</span>
                </label>
                <div className="settings-name-row">
                  <input className="settings-input" data-testid="organization-name" value={brandingName} maxLength={MAX_DISPLAY_NAME_LENGTH} onChange={(event) => setBrandingName(event.target.value)} />
                  <button type="button" className="btn-primary" data-testid="organization-branding-save" disabled={busy} onClick={saveBrandingSettings}>Save</button>
                </div>
            </section>}
            <section className="settings-section">
              <h3>Desktop notifications</h3>
              <p className="settings-hint">Get a desktop alert for direct messages, @mentions, and Starred messages when Echo isn't focused.</p>
              <NotificationToggle />
            </section>
            {!user.isAdmin ? <ChangePassword /> : <AdminPasswordReset users={users} currentUserId={user.id} />}
          </>}

          {activeTab === "appearance" && themes.length > 0 && <section className="settings-section settings-appearance-card">
            <h3>Appearance</h3>
            <p className="settings-hint">Choose a color theme and the surface mode that works best for you.</p>
            <div className="mode-toggle" role="group" aria-label="Light or dark mode">
              <button type="button" className={`mode-option${mode === "light" ? " active" : ""}`} data-testid="settings-mode-light" onClick={() => onSelectMode?.("light")} aria-pressed={mode === "light"}>☀ Light</button>
              <button type="button" className={`mode-option${mode === "dark" ? " active" : ""}`} data-testid="settings-mode-dark" onClick={() => onSelectMode?.("dark")} aria-pressed={mode === "dark"}>☾ Dark</button>
            </div>
            <div className="theme-grid">
              {themes.map((t) => <button key={t.id} type="button" className={`theme-card${theme === t.id ? " active" : ""}`} data-testid={`settings-theme-${t.id}`} onClick={() => onSelectTheme?.(t.id)} aria-pressed={theme === t.id}>
                <span className="theme-swatch">{t.swatch.map((c, i) => <span key={i} style={{ background: c }} />)}</span><span className="theme-name">{t.label}</span>
              </button>)}
            </div>
          </section>}

          {activeTab === "api" && <ApiDocsPage embedded />}

          {error && <div className="error">{error}</div>}
          {saved && <div className="settings-saved">Saved ✓</div>}
        </main>
      </div>
      {avatarDialogOpen && <ProfilePictureDialog file={avatarFile} currentSrc={avatarUrl} onFileSelected={onAvatarFileSelected} onSave={saveAvatar} onClose={() => { setAvatarFile(null); setAvatarDialogOpen(false); }} />}
      {brandingDialogOpen && <ProfilePictureDialog file={brandingImageFile} currentSrc={brandingImageUrl} title="Update organization image" previewAlt="Organization preview" preserveTransparency outputName="organization-logo.png" onFileSelected={onBrandingImageSelected} onSave={saveBrandingImage} onClose={() => { setBrandingImageFile(null); setBrandingDialogOpen(false); }} />}
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
      <button type="button" className={on ? "btn-secondary" : "btn-primary"} data-testid="notification-toggle" onClick={on ? disable : enable}>
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
      <div className="pw-form" data-testid="change-password-form">
        <input
          {...currentPasswordField}
          className="settings-input"
          data-testid="current-password"
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
          data-testid="new-password"
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
          data-testid="confirm-new-password"
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
        <button type="button" className="btn-primary" data-testid="change-password-submit" disabled={isSubmitting} onClick={submit}>
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
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.replace(/^@+/, "").toLowerCase();

  const candidates =
    trimmedQuery && !selected
      ? users
          .filter((u) => u.id !== currentUserId)
          .filter((u) => {
            return (
              u.displayName.toLowerCase().includes(normalizedQuery) ||
              u.username.toLowerCase().includes(normalizedQuery)
            );
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

      <div className="admin-reset" data-testid="admin-reset">
        <div className="admin-user-pick">
          <input
            className="settings-input"
            data-testid="admin-reset-search"
            placeholder="Find a user by name or username"
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
                <button key={u.id} type="button" className="search-row" data-testid={`admin-reset-user-${u.username}`} onClick={() => pick(u)}>
                  <Avatar name={u.displayName} src={u.avatarUrl} size={24} />
                  <span className="search-name">{u.displayName}</span>
                  <span className="search-handle">@{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && !otp && (
          <button type="button" className="btn-primary" data-testid="admin-reset-issue" disabled={busy} onClick={issue}>
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
