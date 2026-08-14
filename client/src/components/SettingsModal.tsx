import { useEffect, useState } from "react";
import { Building2Icon, Code2Icon, GitPullRequestIcon, PaletteIcon, UserRoundIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api, getBackendUrl } from "../api.js";
import Avatar from "./Avatar.js";
import { MAX_DISPLAY_NAME_LENGTH } from "../lib/profile.js";
import ApiDocsPage from "./ApiDocsPage.js";
import ProfilePictureDialog from "./ProfilePictureDialog.js";
import { PASSWORD_RULE } from "../lib/password.js";
import { passwordPairSchema } from "../lib/formSchemas.js";
import { uploadSizeError } from "../lib/uploads.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";
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
  { id: "workspace", label: "Workspace", Icon: Building2Icon, adminOnly: true },
  { id: "integrations", label: "Integrations", Icon: GitPullRequestIcon, adminOnly: true },
  { id: "api", label: "API", Icon: Code2Icon },
];

const AZURE_NOTIFY_OPTIONS = [
  ["pullRequestCreated", "Pull request created"],
  ["pullRequestTitleChanged", "Title changed"],
  ["pullRequestCommented", "Comments"],
  ["pullRequestApproved", "Approved"],
  ["pullRequestApprovalReset", "Approval reset"],
  ["pullRequestRejected", "Rejected"],
  ["pullRequestCompleted", "Merged"],
  ["pullRequestAbandoned", "Abandoned"],
  ["pullRequestReactivated", "Reopened"],
  ["buildValidationSucceeded", "Build passed"],
  ["buildValidationFailed", "Build failed"],
];
function backendOrigin() {
  return getBackendUrl() || (typeof window !== "undefined" ? window.location.origin : "");
}

// User settings: profile picture, display name, and a copyable API token.
export default function SettingsModal({
  user,
  workspace = { name: "Echo", logoUrl: null },
  onWorkspaceUpdated,
  users = [],
  theme,
  themes = [],
  onSelectTheme,
  mode = "dark",
  onSelectMode,
  onUpdated,
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("account");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(workspace.name ?? "Echo");
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState(workspace.logoUrl || null);
  const [workspaceLogoFile, setWorkspaceLogoFile] = useState(null);
  const [azureIntegration, setAzureIntegration] = useState(null);
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureLoading, setAzureLoading] = useState(false);
  const [azureOptionsOpen, setAzureOptionsOpen] = useState(false);
  const workspaceLogoSrc = useAuthUrl(workspaceLogoUrl);

  const nameChanged = displayName.trim() !== user.displayName;

  useEffect(() => {
    setDisplayName(user.displayName);
    setAvatarUrl(user.avatarUrl || null);
  }, [user.displayName, user.avatarUrl]);

  useEffect(() => {
    setWorkspaceName(workspace.name ?? "Echo");
    setWorkspaceLogoUrl(workspace.logoUrl || null);
  }, [workspace.name, workspace.logoUrl]);

  useEffect(() => {
    if (activeTab !== "integrations" || !user.isAdmin) return;
    let cancelled = false;
    setAzureLoading(true);
    api.getAzureDevOpsIntegration()
      .then(({ integrations = [] }) => {
        if (cancelled) return;
        const integration = integrations[0] || null;
        setAzureIntegration(integration);
        setAzureEndpoint(integration?.endpoint ? `${backendOrigin()}${integration.endpoint}` : "");
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setAzureLoading(false));
    return () => { cancelled = true; };
  }, [activeTab, user.isAdmin]);

  const visibleTabs = SETTINGS_TABS.filter((tab) => !tab.adminOnly || user.isAdmin);

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

  function onWorkspaceLogoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Workspace logo must be a PNG, JPEG, or WebP image");
      return;
    }
    const sizeError = uploadSizeError([file], undefined, "Workspace logos");
    if (sizeError) return setError(sizeError);
    setError(null);
    setWorkspaceLogoFile(file);
    setWorkspaceLogoUrl(URL.createObjectURL(file));
  }

  async function saveWorkspace() {
    const nextName = workspaceName.trim();
    if (nextName.length > 80) return setError("Organization name must be at most 80 characters");
    setBusy(true);
    setError(null);
    try {
      let logoKey;
      if (workspaceLogoFile) {
        const result = await api.uploadFiles([workspaceLogoFile]);
        logoKey = result.attachments[0].key;
      }
      const result = await api.updateWorkspace({ name: nextName, ...(logoKey ? { logoKey } : {}) });
      onWorkspaceUpdated?.(result.workspace);
      setWorkspaceLogoFile(null);
      flashSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkspaceLogo() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.updateWorkspace({ logoKey: null });
      onWorkspaceUpdated?.(result.workspace);
      setWorkspaceLogoFile(null);
      setWorkspaceLogoUrl(null);
      flashSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createAzureIntegration() {
    setAzureLoading(true);
    setError(null);
    try {
      const result = await api.createAzureDevOpsIntegration();
      setAzureIntegration(result.integration);
      setAzureEndpoint(`${backendOrigin()}${result.endpointPath}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAzureLoading(false);
    }
  }

  async function regenerateAzureToken() {
    if (!azureIntegration) return;
    setAzureLoading(true);
    setError(null);
    try {
      const result = await api.regenerateAzureDevOpsToken(azureIntegration.id);
      setAzureEndpoint(`${backendOrigin()}${result.endpoint}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAzureLoading(false);
    }
  }

  async function copyAzureEndpoint() {
    if (!azureEndpoint) return;
    await navigator.clipboard?.writeText(azureEndpoint);
    flashSaved();
  }

  async function setAzureActive(active) {
    if (!azureIntegration) return;
    setAzureLoading(true);
    setError(null);
    try {
      const { integration } = await api.updateAzureDevOpsIntegration(azureIntegration.id, { active });
      setAzureIntegration(integration);
    } catch (err) {
      setError(err.message);
    } finally {
      setAzureLoading(false);
    }
  }

  async function setAzureNotification(key, enabled) {
    if (!azureIntegration) return;
    setAzureLoading(true);
    setError(null);
    try {
      const { integration } = await api.updateAzureDevOpsIntegration(azureIntegration.id, { notify: { [key]: enabled } });
      setAzureIntegration(integration);
    } catch (err) {
      setError(err.message);
    } finally {
      setAzureLoading(false);
    }
  }

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings categories">
          <div className="settings-nav-account">
            <span className="settings-nav-username">@{user.username}</span>
          </div>
          <nav className="settings-nav-list">
            {visibleTabs.map(({ id, label, Icon }) => (
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

          {activeTab === "workspace" && user.isAdmin && <section className="settings-section workspace-branding-section">
            <h3>Workspace identity</h3>
            <p className="settings-hint">Set the name and logo your team sees in the Echo navigation.</p>
            <div className="workspace-branding-layout">
              <div className="workspace-branding-showcase">
                <div className="workspace-branding-preview">
                  <div className="workspace-branding-logo">
                    {workspaceLogoSrc ? <img src={workspaceLogoSrc} alt="" /> : <span className="workspace-branding-fallback">E</span>}
                  </div>
                  <div className="workspace-branding-preview-copy">
                    <span>Preview</span>
                    <strong>{workspaceName.trim() || "Your organization"}</strong>
                    <small>Shown in the navigation and browser title.</small>
                  </div>
                </div>
              </div>
              <div className="workspace-branding-form">
                <div className="workspace-branding-field">
                  <label className="settings-profile-field-label" htmlFor="workspace-name">Organization name</label>
                  <input id="workspace-name" className="settings-input" value={workspaceName} maxLength={80} onChange={(event) => setWorkspaceName(event.target.value)} />
                </div>
                <div className="workspace-branding-field">
                  <span className="settings-profile-field-label">Logo</span>
                  <div className="workspace-logo-picker">
                    <label className="workspace-upload-button" htmlFor="workspace-logo">Choose image</label>
                    <span>{workspaceLogoFile?.name || (workspaceLogoUrl ? "Current logo selected" : "No logo selected")}</span>
                    <input id="workspace-logo" className="workspace-logo-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onWorkspaceLogoSelected} disabled={busy} />
                  </div>
                  <p className="settings-hint">PNG, JPEG, or WebP · up to 10 MB.</p>
                </div>
                <div className="workspace-branding-actions">
                  <button type="button" className="btn-primary" disabled={busy} onClick={saveWorkspace}>Save branding</button>
                  {workspaceLogoUrl && <button type="button" className="link-danger" disabled={busy} onClick={removeWorkspaceLogo}>Remove logo</button>}
                  {saved && <span className="workspace-save-status">Saved ✓</span>}
                </div>
              </div>
            </div>
          </section>}

          {activeTab === "integrations" && user.isAdmin && <section className="integration-page">
            <div className="integration-page-heading">
              <div>
                <h2>Integrations and connected apps</h2>
                <p>Connect the tools your team uses every day.</p>
              </div>
            </div>
            {azureLoading && !azureIntegration && <p className="settings-hint">Loading integration…</p>}
            {!azureLoading && !azureIntegration && <button type="button" className="btn-primary" onClick={createAzureIntegration}>Enable Azure DevOps</button>}
            {azureIntegration && <article className="integration-card">
              <button type="button" className="integration-card-main" onClick={() => setAzureOptionsOpen(true)}>
                <div className="integration-card-icon"><img src="/azure-devops-icon.svg" alt="" /></div>
                <div className="integration-card-copy">
                  <h3>Azure DevOps</h3>
                  <span>dev.azure.com</span>
                  <p>Bring pull requests, comments, approvals, and build status into Echo.</p>
                </div>
              </button>
              <div className="integration-card-footer">
                <button type="button" className="btn-secondary" onClick={() => setAzureOptionsOpen(true)}>View integration</button>
                <label className={`integration-switch${azureIntegration.active ? " is-on" : ""}`}>
                  <input type="checkbox" checked={!!azureIntegration.active} disabled={azureLoading} onChange={(event) => setAzureActive(event.target.checked)} />
                  <span className="integration-switch-track"><span /></span>
                  <span className="sr-only">{azureIntegration.active ? "Disable" : "Enable"} Azure DevOps</span>
                </label>
              </div>
            </article>}
            {azureOptionsOpen && azureIntegration && <div className="integration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAzureOptionsOpen(false); }}>
              <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="azure-integration-title">
                <div className="integration-dialog-header">
                  <div className="integration-dialog-title"><img src="/azure-devops-icon.svg" alt="" /><div><h3 id="azure-integration-title">Azure DevOps</h3><p>Integration settings</p></div></div>
                  <button type="button" className="settings-close" onClick={() => setAzureOptionsOpen(false)} aria-label="Close integration settings">✕</button>
                </div>
                <div className="integration-dialog-body">
                  <div className="integration-option-row"><div><strong>Integration status</strong><span>{azureIntegration.active ? "Azure events are enabled" : "Azure events are disabled"}</span></div><label className={`integration-switch${azureIntegration.active ? " is-on" : ""}`}><input type="checkbox" checked={!!azureIntegration.active} disabled={azureLoading} onChange={(event) => setAzureActive(event.target.checked)} /><span className="integration-switch-track"><span /></span></label></div>
                  <div className="integration-dialog-section"><h4>Webhook endpoint</h4><p className="settings-hint">Add this URL to an Azure DevOps Service Hook.</p><input id="azure-webhook-endpoint" className="settings-input" value={azureEndpoint} readOnly /><div className="integration-actions"><button type="button" className="btn-secondary" disabled={!azureEndpoint} onClick={copyAzureEndpoint}>Copy endpoint</button><button type="button" className="btn-secondary" disabled={azureLoading} onClick={regenerateAzureToken}>Regenerate token</button></div></div>
                  <div className="integration-dialog-section"><h4>Events to send</h4><div className="integration-notify-grid">{AZURE_NOTIFY_OPTIONS.map(([key, label]) => <label key={key} className="integration-notify-option"><span>{label}</span><span className={`integration-switch integration-notify-switch${azureIntegration.notify?.[key] !== false ? " is-on" : ""}`}><input type="checkbox" checked={azureIntegration.notify?.[key] !== false} disabled={azureLoading || !azureIntegration.active} onChange={(event) => setAzureNotification(key, event.target.checked)} /><span className="integration-switch-track"><span /></span></span></label>)}</div></div>
                  {azureIntegration.lastReceivedAt && <p className="settings-hint">Last event: {new Date(azureIntegration.lastReceivedAt).toLocaleString()}</p>}
                  {azureIntegration.lastError && <p className="error">{azureIntegration.lastError}</p>}
                </div>
              </section>
            </div>}
          </section>}

          {activeTab === "api" && <ApiDocsPage embedded />}

          {error && <div className="error">{error}</div>}
          {saved && activeTab !== "workspace" && <div className="settings-saved">Saved ✓</div>}
        </main>
      </div>
      {avatarDialogOpen && <ProfilePictureDialog file={avatarFile} currentSrc={avatarUrl} onFileSelected={onAvatarFileSelected} onSave={saveAvatar} onClose={() => { setAvatarFile(null); setAvatarDialogOpen(false); }} />}
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
