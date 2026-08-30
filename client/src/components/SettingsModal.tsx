import { useEffect, useState } from "react";
import { Building2Icon, Code2Icon, DownloadIcon, GitPullRequestIcon, KeyboardIcon, PaletteIcon, UserRoundIcon, WebhookIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api, getBackendUrl } from "../api.js";
import Avatar from "./Avatar.js";
import { MAX_DISPLAY_NAME_LENGTH } from "../lib/profile.js";
import ApiDocsPage from "./ApiDocsPage.js";
import ProfilePictureDialog from "./ProfilePictureDialog.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { PASSWORD_RULE } from "../lib/password.js";
import { passwordPairSchema } from "../lib/formSchemas.js";
import { uploadSizeError } from "../lib/uploads.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";
import { KEYBOARD_SHORTCUT_GROUPS } from "../lib/keyboardShortcuts.js";
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
  { id: "webhooks", label: "Webhooks", Icon: WebhookIcon },
  { id: "workspace", label: "Workspace", Icon: Building2Icon, adminOnly: true },
  { id: "integrations", label: "Integrations", Icon: GitPullRequestIcon, adminOnly: true },
  { id: "desktop", label: "Desktop", Icon: DownloadIcon },
  { id: "shortcuts", label: "Keyboard shortcuts", Icon: KeyboardIcon },
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

function defaultAllureChannelName(projectId) {
  const slug = String(projectId || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55) || "default";
  return `allure-${slug}`;
}

function JenkinsIntegrationIcon() {
  return <span className="jenkins-integration-mark" aria-hidden="true">J</span>;
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
  onIntegrationsChanged,
  settingsTab = "account",
  onSettingsTabChange,
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState(settingsTab);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(workspace.name ?? "Echo");
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState(workspace.logoUrl || null);
  const [workspaceLogoFile, setWorkspaceLogoFile] = useState(null);
  const [azureIntegration, setAzureIntegration] = useState(null);
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureLoading, setAzureLoading] = useState(false);
  const [azureOptionsOpen, setAzureOptionsOpen] = useState(false);
  const [allureIntegration, setAllureIntegration] = useState(null);
  const [allureUrl, setAllureUrl] = useState("");
  const [allureUsername, setAllureUsername] = useState("");
  const [allurePassword, setAllurePassword] = useState("");
  const [allureLoading, setAllureLoading] = useState(false);
  const [allureOptionsOpen, setAllureOptionsOpen] = useState(false);
  const [allureResetOpen, setAllureResetOpen] = useState(false);
  const [allureProjects, setAllureProjects] = useState([]);
  const [allureSelectedProjects, setAllureSelectedProjects] = useState([]);
  const [allureChannelMappings, setAllureChannelMappings] = useState({});
  const [allureError, setAllureError] = useState(null);
  const [allureSaved, setAllureSaved] = useState(false);
  const [jenkinsOptionsOpen, setJenkinsOptionsOpen] = useState(false);
  const [jenkinsDownloading, setJenkinsDownloading] = useState(false);
  const [jenkinsDownloadError, setJenkinsDownloadError] = useState(null);
  const [desktopDownloads, setDesktopDownloads] = useState(null);
  const [desktopDownloadsError, setDesktopDownloadsError] = useState(null);
  const [mentionWebhook, setMentionWebhook] = useState(null);
  const [mentionWebhookUrl, setMentionWebhookUrl] = useState("");
  const [mentionWebhookEnabled, setMentionWebhookEnabled] = useState(true);
  const [mentionWebhookLoading, setMentionWebhookLoading] = useState(false);
  const [mentionWebhookSaved, setMentionWebhookSaved] = useState(false);
  const workspaceLogoSrc = useAuthUrl(workspaceLogoUrl);

  const nameChanged = displayName.trim() !== user.displayName;

  useEffect(() => {
    if (activeTab !== "desktop") return;
    let cancelled = false;
    setDesktopDownloadsError(null);
    fetch(`${backendOrigin()}/api/desktop-downloads`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Desktop downloads are unavailable");
        return response.json();
      })
      .then((downloads) => !cancelled && setDesktopDownloads(downloads))
      .catch((err) => !cancelled && setDesktopDownloadsError(err.message));
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "webhooks") return;
    let cancelled = false;
    setMentionWebhookLoading(true);
    api.getMentionWebhook()
      .then(({ webhook }) => {
        if (cancelled) return;
        setMentionWebhook(webhook || null);
        setMentionWebhookUrl(webhook?.url || "");
        setMentionWebhookEnabled(webhook?.enabled ?? true);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setMentionWebhookLoading(false));
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    setActiveTab(settingsTab);
  }, [settingsTab]);

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

  useEffect(() => {
    if (activeTab !== "integrations" || !user.isAdmin) return;
    let cancelled = false;
    setAllureLoading(true);
    api.getAllureIntegration()
      .then(({ allure }) => {
        if (cancelled) return;
        setAllureIntegration(allure || null);
        setAllureUrl(allure?.url || "");
        setAllureUsername(allure?.username || "");
        const currentProjects = (allure?.projects || []).map((project) => project.id);
        setAllureProjects(currentProjects);
        setAllureSelectedProjects(allure?.selectedProjectIds?.length ? allure.selectedProjectIds : currentProjects);
        setAllureChannelMappings(Object.fromEntries((allure?.projects || []).map((project) => [project.id, project.channel || defaultAllureChannelName(project.id)])));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setAllureLoading(false));
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

  async function saveAllure() {
    setAllureLoading(true);
    setError(null);
      setAllureError(null);
      setAllureSaved(false);
    try {
      const payload = {
        url: allureUrl,
        username: allureUsername,
        enabled: !!allureUrl.trim(),
        projectIds: allureSelectedProjects,
        channelMappings: allureProjects.map((projectId) => ({ projectId, channelName: allureChannelMappings[projectId] || defaultAllureChannelName(projectId) })),
      };
      // An empty username means the admin is switching to an unsecured
      // service, so clear any previously stored password too. When a username
      // remains, an empty password keeps the saved secret.
      if (allurePassword || !allureUsername.trim()) payload.password = allurePassword;
      const result = await api.updateAllureIntegration(payload);
      setAllureIntegration(result.allure);
      setAllurePassword("");
      onIntegrationsChanged?.();
      setAllureSaved(true);
      setAllureOptionsOpen(false);
    } catch (err) {
      setAllureError(err.message);
    } finally {
      setAllureLoading(false);
    }
  }

  async function resetAllure() {
    setAllureLoading(true);
    setError(null);
    setAllureError(null);
    try {
      const result = await api.updateAllureIntegration({ url: "", username: "", password: "", enabled: false, projectIds: [] });
      setAllureIntegration(result.allure);
      setAllureUrl("");
      setAllureUsername("");
      setAllurePassword("");
      setAllureProjects([]);
      setAllureSelectedProjects([]);
      setAllureChannelMappings({});
      setAllureResetOpen(false);
      setAllureOptionsOpen(false);
      onIntegrationsChanged?.();
      setAllureSaved(true);
    } catch (err) {
      setAllureError(err.message);
    } finally {
      setAllureLoading(false);
    }
  }

  async function discoverAllureProjects() {
    setAllureLoading(true);
    setError(null);
    setAllureError(null);
    try {
      const result = await api.discoverAllureProjects({ url: allureUrl, username: allureUsername, password: allurePassword });
      setAllureProjects(result.projects || []);
      setAllureChannelMappings((previous) => Object.fromEntries((result.projects || []).map((projectId) => [projectId, previous[projectId] || defaultAllureChannelName(projectId)])));
      setAllureSelectedProjects((previous) => {
        const existing = new Set(previous);
        const kept = (result.projects || []).filter((projectId) => existing.has(projectId));
        return kept.length ? kept : result.projects || [];
      });
    } catch (err) {
      setAllureError(err.message);
    } finally {
      setAllureLoading(false);
    }
  }

  async function syncAllure() {
    setAllureLoading(true);
    setError(null);
    setAllureError(null);
    setAllureSaved(false);
    try {
      const result = await api.syncAllureIntegration();
      setAllureIntegration((previous) => ({ ...previous, projects: result.projects, lastSyncedAt: result.lastSyncedAt }));
      onIntegrationsChanged?.();
      setAllureSaved(true);
    } catch (err) {
      setAllureError(err.message);
    } finally {
      setAllureLoading(false);
    }
  }

  async function downloadJenkinsPlugin() {
    setJenkinsDownloading(true);
    setJenkinsDownloadError(null);
    try {
      const { blob, filename } = await api.downloadJenkinsPlugin();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setJenkinsDownloadError(err.message);
    } finally {
      setJenkinsDownloading(false);
    }
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

  async function saveMentionWebhook() {
    setMentionWebhookLoading(true);
    setMentionWebhookSaved(false);
    setError(null);
    try {
      const { webhook } = await api.saveMentionWebhook({ url: mentionWebhookUrl, enabled: mentionWebhookEnabled });
      setMentionWebhook(webhook);
      setMentionWebhookUrl(webhook.url);
      setMentionWebhookEnabled(webhook.enabled);
      setMentionWebhookSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setMentionWebhookLoading(false);
    }
  }

  async function removeMentionWebhook() {
    setMentionWebhookLoading(true);
    setMentionWebhookSaved(false);
    setError(null);
    try {
      await api.deleteMentionWebhook();
      setMentionWebhook(null);
      setMentionWebhookUrl("");
      setMentionWebhookEnabled(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setMentionWebhookLoading(false);
    }
  }

  async function copyMentionWebhookSecret() {
    if (!mentionWebhook?.signingSecret) return;
    try {
      await navigator.clipboard.writeText(mentionWebhook.signingSecret);
    } catch {
      setError("Couldn't copy the signing secret. Select and copy it manually.");
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
                <button key={id} type="button" className={`settings-nav-item${activeTab === id ? " active" : ""}`} onClick={() => { setActiveTab(id); onSettingsTabChange?.(id); }} aria-current={activeTab === id ? "page" : undefined}>
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
            {!user.isAdmin ? (user.canChangePassword ? <ChangePassword /> : <SsoPasswordNotice />) : <AdminPasswordReset users={users} currentUserId={user.id} />}
          </>}

          {activeTab === "webhooks" && <section className="settings-section mention-webhook-settings" data-testid="mention-webhook-settings">
            <div className="mention-webhook-hero">
              <span className="mention-webhook-icon" aria-hidden="true"><WebhookIcon size={22} strokeWidth={2} /></span>
              <div>
                <h3>Mention webhook</h3>
                <p>Send a signed event whenever someone mentions <strong>@{user.username}</strong>.</p>
              </div>
              <span className={`mention-webhook-status${mentionWebhook?.enabled ? " is-active" : ""}`}>{mentionWebhook?.enabled ? "Active" : mentionWebhook ? "Paused" : "Not configured"}</span>
            </div>
            <div className="mention-webhook-card">
              <div className="mention-webhook-field">
                <label className="settings-profile-field-label" htmlFor="mention-webhook-url">Destination URL</label>
                <span>Echo sends new mention events to this endpoint.</span>
              </div>
              <input
                id="mention-webhook-url"
                className="settings-input"
                data-testid="mention-webhook-url"
                type="url"
                placeholder="https://example.com/echo-events"
                value={mentionWebhookUrl}
                onChange={(event) => { setMentionWebhookUrl(event.target.value); setMentionWebhookSaved(false); }}
                disabled={mentionWebhookLoading}
              />
              <label className="mention-webhook-enabled">
                <span><strong>Deliver events</strong><small>Send each new @mention to this endpoint.</small></span>
                <span className={`integration-switch${mentionWebhookEnabled ? " is-on" : ""}`}><input type="checkbox" checked={mentionWebhookEnabled} disabled={mentionWebhookLoading} onChange={(event) => { setMentionWebhookEnabled(event.target.checked); setMentionWebhookSaved(false); }} /><span className="integration-switch-track"><span /></span></span>
              </label>
            </div>
            <div className="mention-webhook-actions">
              <button type="button" className="btn-primary" data-testid="mention-webhook-save" disabled={mentionWebhookLoading || !mentionWebhookUrl.trim()} onClick={saveMentionWebhook}>{mentionWebhook ? "Save webhook" : "Create webhook"}</button>
              {mentionWebhook && <button type="button" className="btn-danger-outline" data-testid="mention-webhook-remove" disabled={mentionWebhookLoading} onClick={removeMentionWebhook}>Remove webhook</button>}
              {mentionWebhookSaved && <span className="workspace-save-status">Saved ✓</span>}
            </div>
            {mentionWebhook?.signingSecret && <div className="mention-webhook-secret">
              <div><label className="settings-profile-field-label" htmlFor="mention-webhook-secret">Signing secret</label><p>Use this to validate the <code>x-echo-signature</code> header.</p></div>
              <div className="mention-webhook-secret-value">
                <input id="mention-webhook-secret" className="settings-input" data-testid="mention-webhook-secret" value={mentionWebhook.signingSecret} readOnly />
                <button type="button" className="btn-secondary" onClick={copyMentionWebhookSecret}>Copy</button>
              </div>
            </div>}
          </section>}

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
            <div className="integration-card-grid">
            <article className="integration-card jenkins-integration-card">
              <button type="button" className="integration-card-main" onClick={() => { setJenkinsDownloadError(null); setJenkinsOptionsOpen(true); }}>
                <div className="integration-card-icon"><JenkinsIntegrationIcon /></div>
                <div className="integration-card-copy">
                  <h3>Jenkins</h3>
                  <span>Pipeline notifications</span>
                  <p>Send Jenkins build notifications to Echo channels or individual users.</p>
                </div>
              </button>
              <div className="integration-card-footer">
                <button type="button" className="btn-secondary" onClick={() => { setJenkinsDownloadError(null); setJenkinsOptionsOpen(true); }}>Configure</button>
                <span className="integration-card-status">Available</span>
              </div>
            </article>
            {azureLoading && !azureIntegration && <article className="integration-card integration-card-placeholder"><p className="settings-hint">Loading integration…</p></article>}
            {!azureLoading && !azureIntegration && <article className="integration-card integration-card-placeholder"><div><h3>Azure DevOps</h3><p className="settings-hint">Connect Azure DevOps to bring pull requests, comments, approvals, and build status into Echo.</p><button type="button" className="btn-primary" onClick={createAzureIntegration}>Enable Azure DevOps</button></div></article>}
            {azureIntegration && <article className="integration-card">
              <button type="button" className="integration-card-main" onClick={() => setAzureOptionsOpen(true)}>
                <div className="integration-card-icon"><img className="azure-integration-icon" src="/azure-devops-icon.svg" alt="" /></div>
                <div className="integration-card-copy">
                  <h3>Azure DevOps</h3>
                  <span>dev.azure.com</span>
                  <p>Bring pull requests, comments, approvals, and build status into Echo.</p>
                </div>
              </button>
              <div className="integration-card-footer">
                <button type="button" className="btn-secondary" onClick={() => setAzureOptionsOpen(true)}>Configure</button>
              </div>
            </article>}
            <article className="integration-card allure-integration-card">
              <button type="button" className="integration-card-main" onClick={() => setAllureOptionsOpen(true)}>
                <div className="integration-card-icon"><img className="allure-integration-icon" src="/allure-docker-icon.png" alt="" /></div>
                <div className="integration-card-copy">
                  <h3>allure docker service</h3>
                  <span>{allureIntegration?.enabled ? `${allureIntegration.projects?.length || 0} project channels` : "Not configured"}</span>
                  <p>{allureIntegration?.enabled ? "Latest reports are available in read-only Echo channels." : "Connect an Allure service to create report channels."}</p>
                </div>
              </button>
              <div className="integration-card-footer">
                <button type="button" className="btn-secondary" onClick={() => setAllureOptionsOpen(true)}>{allureIntegration?.enabled ? "Configure" : "Connect"}</button>
                <span className="integration-card-status">{allureIntegration?.enabled ? "Connected" : "Disabled"}</span>
              </div>
            </article>
            </div>
            {jenkinsOptionsOpen && <div className="integration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJenkinsOptionsOpen(false); }}>
              <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="jenkins-integration-title">
                <div className="integration-dialog-header">
                  <div className="integration-dialog-title"><JenkinsIntegrationIcon /><div><h3 id="jenkins-integration-title">Jenkins</h3><p>Pipeline notifications</p></div></div>
                  <button type="button" className="settings-close" onClick={() => setJenkinsOptionsOpen(false)} aria-label="Close Jenkins configuration">✕</button>
                </div>
                <div className="integration-dialog-body jenkins-settings-body">
                  <div className="integration-dialog-section">
                    <h4>What it does</h4>
                    <p>Use the Echo Jenkins plugin to post build messages to a channel or send a direct message to a specific Echo user.</p>
                  </div>
                  <div className="integration-dialog-section">
                    <h4>1. Install the plugin</h4>
                    <p>Download the plugin, then open <strong>Manage Jenkins → Plugins → Advanced</strong> and upload the HPI file.</p>
                    <button type="button" className="btn-primary" disabled={jenkinsDownloading} onClick={downloadJenkinsPlugin}>
                      {jenkinsDownloading ? "Preparing download…" : "Download Jenkins plugin"}
                    </button>
                    {jenkinsDownloadError && <p className="error" role="alert">{jenkinsDownloadError}</p>}
                  </div>
                  <div className="integration-dialog-section">
                    <h4>2. Configure Echo in Jenkins</h4>
                    <p>Under <strong>Manage Jenkins → System → Echo Notifier</strong>, set the Echo server URL and choose a Jenkins Secret Text credential containing an Echo API token.</p>
                  </div>
                  <div className="integration-dialog-section">
                    <h4>3. Send from a Pipeline</h4>
                    <pre className="integration-code-block"><code>{`echoSend(
  channel: 'builds',
  message: 'Build completed',
  status: 'success'
)`}</code></pre>
                    <p className="settings-hint">Use <code>recipient: 'username'</code> instead of <code>channel</code> to send a direct message.</p>
                  </div>
                </div>
              </section>
            </div>}
            {allureOptionsOpen && <div className="integration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAllureOptionsOpen(false); }}>
              <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="allure-integration-title">
                <div className="integration-dialog-header">
                  <div className="integration-dialog-title"><img className="allure-integration-icon" src="/allure-docker-icon.png" alt="" /><div><h3 id="allure-integration-title">allure docker service</h3><p>Integration settings</p></div></div>
                  <button type="button" className="settings-close" onClick={() => setAllureOptionsOpen(false)} aria-label="Close integration settings">✕</button>
                </div>
                <div className="integration-dialog-body allure-settings-body">
                  <label className="settings-profile-field-label" htmlFor="allure-url">Allure service URL</label>
                  <input id="allure-url" className="settings-input" value={allureUrl} onChange={(event) => setAllureUrl(event.target.value)} placeholder="http://allure:5050" />
                  <label className="settings-profile-field-label" htmlFor="allure-username">Username <span>(optional)</span></label>
                  <input id="allure-username" className="settings-input" value={allureUsername} onChange={(event) => setAllureUsername(event.target.value)} autoComplete="new-password" />
                  <label className="settings-profile-field-label" htmlFor="allure-password">Password <span>(optional)</span></label>
                  <input id="allure-password" className="settings-input" type="password" value={allurePassword} onChange={(event) => setAllurePassword(event.target.value)} autoComplete="new-password" />
                  <p className="settings-hint">Leave the password blank to keep the saved password when using a username. To use an unsecured Allure service, clear both credentials. Credentials are stored encrypted on the Echo server and are never sent to users. When Echo runs in Docker, use a URL reachable from the Echo container, such as <code>http://172.17.0.1:5050</code>.</p>
                  <div className="allure-project-picker">
                    <div className="allure-project-picker-header"><div><strong>Projects to sync</strong><span>{allureProjects.length ? `${allureSelectedProjects.length} of ${allureProjects.length} selected · set an Echo channel for each project` : "Choose which projects become Echo channels"}</span></div><button type="button" className="btn-secondary" disabled={allureLoading || !allureUrl.trim()} onClick={discoverAllureProjects}>Discover projects</button></div>
                    {allureProjects.length > 0 ? <div className="allure-project-list">{allureProjects.map((projectId) => <div key={projectId} className={`allure-project-option${allureSelectedProjects.includes(projectId) ? " is-selected" : ""}`}><label className="allure-project-option-toggle"><input type="checkbox" checked={allureSelectedProjects.includes(projectId)} onChange={(event) => setAllureSelectedProjects((previous) => event.target.checked ? [...new Set([...previous, projectId])] : previous.filter((id) => id !== projectId))} /><span className="allure-project-check" aria-hidden="true">✓</span><span className="allure-project-name">{projectId}</span></label><label className="allure-project-channel-field"><span>Echo channel</span><input className="allure-project-channel-input" aria-label={`Echo channel for ${projectId}`} value={allureChannelMappings[projectId] || defaultAllureChannelName(projectId)} onChange={(event) => setAllureChannelMappings((previous) => ({ ...previous, [projectId]: event.target.value }))} placeholder={defaultAllureChannelName(projectId)} /></label></div>)}</div> : <div className="allure-project-empty"><span className="allure-project-empty-icon">✦</span><div><strong>No projects discovered yet</strong><p>Enter your Allure URL, then discover projects to choose what becomes an Echo channel.</p></div></div>}
                    {allureProjects.length > 1 && <div className="allure-project-picker-actions"><button type="button" className="link-button" onClick={() => setAllureSelectedProjects([...allureProjects])}>Select all</button><button type="button" className="link-button" onClick={() => setAllureSelectedProjects([])}>Clear all</button></div>}
                  </div>
                  <div className="integration-actions">
                    <button type="button" className="btn-primary" disabled={allureLoading || !allureProjects.length || (!allureIntegration?.enabled && !allureSelectedProjects.length)} title={!allureProjects.length ? "Discover projects before connecting" : undefined} onClick={saveAllure}>{allureIntegration?.enabled ? "Save and sync" : "Connect Allure"}</button>
                    {allureIntegration?.enabled && <button type="button" className="btn-secondary" disabled={allureLoading} onClick={syncAllure}>Sync projects</button>}
                  </div>
                  <div className="integration-danger-zone"><div><strong>Reset integration</strong><span>Remove the connection and archive its Echo channels.</span></div><button type="button" className="btn-danger-outline" disabled={allureLoading} onClick={() => setAllureResetOpen(true)}>Reset</button></div>
                  {allureSaved && <div className="allure-dialog-feedback is-success">Allure settings saved successfully.</div>}
                  {allureError && <div className="allure-dialog-feedback is-error" role="alert">{allureError}</div>}
                  {allureIntegration?.lastError && <p className="error">{allureIntegration.lastError}</p>}
                  {allureIntegration?.projects?.length > 0 && <p className="settings-hint">Created channels: {allureIntegration.projects.map((project) => `#${project.channel}`).join(", ")}</p>}
                </div>
              </section>
            </div>}
            {allureResetOpen && <ConfirmDialog title="Reset Allure integration?" message="This clears the saved URL and credentials, removes the project selection, and archives the Allure channels. You can reconnect later." confirmLabel="Reset integration" danger onConfirm={resetAllure} onCancel={() => setAllureResetOpen(false)} />}
            {azureOptionsOpen && azureIntegration && <div className="integration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAzureOptionsOpen(false); }}>
              <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="azure-integration-title">
                <div className="integration-dialog-header">
                  <div className="integration-dialog-title"><img className="azure-integration-icon" src="/azure-devops-icon.svg" alt="" /><div><h3 id="azure-integration-title">Azure DevOps</h3><p>Integration settings</p></div></div>
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

          {activeTab === "desktop" && <DesktopDownloads downloads={desktopDownloads} error={desktopDownloadsError} />}

          {activeTab === "shortcuts" && (
            <section className="settings-section settings-shortcuts-section">
              <h3>Keyboard shortcuts</h3>
              <p className="settings-hint">Use these shortcuts to move through Echo quickly. Shortcuts are fixed for everyone.</p>
              <div className="shortcut-groups">
                {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
                  <section className="shortcut-group" key={group.label} aria-labelledby={`shortcut-group-${group.label.toLowerCase()}`}>
                    <h4 id={`shortcut-group-${group.label.toLowerCase()}`}>{group.label}</h4>
                    <div className="shortcut-list">
                      {group.shortcuts.map((shortcut) => (
                        <div className="shortcut-row" key={`${group.label}-${shortcut.description}`}>
                          <span className="shortcut-description">{shortcut.description}</span>
                          <span className="shortcut-keys" aria-label={shortcut.keys.join(" ")}>
                            {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}

          {error && <div className="error">{error}</div>}
          {saved && activeTab !== "workspace" && <div className="settings-saved">Saved ✓</div>}
        </main>
      </div>
      {avatarDialogOpen && <ProfilePictureDialog file={avatarFile} currentSrc={avatarUrl} onFileSelected={onAvatarFileSelected} onSave={saveAvatar} onClose={() => { setAvatarFile(null); setAvatarDialogOpen(false); }} />}
    </div>
  );
}

function DesktopDownloads({ downloads, error }) {
  if (error) return <section className="settings-section"><h3>Desktop apps</h3><p className="error">{error}</p></section>;
  if (!downloads) return <section className="settings-section"><h3>Desktop apps</h3><p className="settings-hint">Loading download options…</p></section>;

  const platforms = [
    { key: "windows", label: "Windows", description: "Install the native Echo desktop app for Windows." },
    { key: "linux", label: "Linux", description: "Download the portable Echo AppImage for Linux." },
  ];
  return (
    <section className="settings-section desktop-downloads-section">
      <h3>Desktop apps</h3>
      <p className="settings-hint">These installers are provided by this Echo server and are available without internet access.</p>
      <div className="desktop-download-grid">
        {platforms.map(({ key, label, description }) => {
          const download = downloads[key];
          return <article className="desktop-download-card" key={key}>
            <h4>{label}</h4>
            <p>{description}</p>
            {download?.available ? <a className="btn-primary desktop-download-button" href={`${backendOrigin()}${download.url}`} download>{`Download for ${label}`}</a> : <span className="settings-hint">Not included in this deployment.</span>}
          </article>;
        })}
      </div>
      {downloads.version && <p className="settings-hint">Package version: {downloads.version}</p>}
    </section>
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

function SsoPasswordNotice() {
  return (
    <section className="settings-section" data-testid="sso-password-settings">
      <h3>Password</h3>
      <p className="settings-hint">Your password is managed by your single sign-on provider.</p>
    </section>
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
