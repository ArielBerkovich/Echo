import AIIntegration from "./AIIntegration.js";
import AzureWorkItemsIntegration from "./AzureWorkItemsIntegration.js";
import { useEffect, useRef, useState } from "react";
import { Building2Icon, CheckIcon, ChevronDownIcon, Code2Icon, DownloadIcon, GitPullRequestIcon, KeyboardIcon, Maximize2Icon, Minimize2Icon, PaletteIcon, PlugZapIcon, SlidersHorizontalIcon, UserRoundIcon, WebhookIcon } from "lucide-react";
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
import MessageSoundControls from "./MessageSoundControls.js";
import { NotificationDefaults } from "./NotificationPreferences.js";
import { CloseButton } from "./Button.js";
import { useI18n } from "../lib/i18n.js";

const SETTINGS_TABS = [
  { id: "account", label: "Account", Icon: UserRoundIcon },
  { id: "appearance", label: "Appearance", Icon: PaletteIcon },
  { id: "preferences", label: "Preferences", Icon: SlidersHorizontalIcon },
  { id: "workspace", label: "Workspace", Icon: Building2Icon, adminOnly: true },
  { id: "integrations", label: "Integrations", Icon: GitPullRequestIcon, adminOnly: true },
  { id: "desktop", label: "Desktop", Icon: DownloadIcon },
  { id: "shortcuts", label: "Keyboard shortcuts", Icon: KeyboardIcon },
  { id: "api", label: "API", Icon: Code2Icon },
  { id: "mcp", label: "MCP", Icon: PlugZapIcon },
  { id: "webhooks", label: "Webhooks", Icon: WebhookIcon },
];

const THEME_TRANSLATION_KEYS = {
  nord: "themeNord",
  aubergine: "themeAubergine",
  azure: "themeAzure",
  midnight: "themeMidnight",
  dracula: "themeDracula",
  sand: "themeSand",
  calm: "themeStillwater",
  rose: "themeRose",
};

function LanguageSelect({ language, setLanguage, t }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef(null);
  const options = [
    { value: "en", label: t("english") },
    { value: "he", label: t("hebrew") },
  ];
  const selected = options.find((option) => option.value === language) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!controlRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function selectLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = options.findIndex((option) => option.value === language) + (event.key === "ArrowDown" ? 1 : -1);
      const nextOption = options[(nextIndex + options.length) % options.length];
      selectLanguage(nextOption.value);
    }
  }

  return (
    <div className="settings-language-control" ref={controlRef}>
      <select
        className="settings-language-native"
        data-testid="settings-language"
        aria-hidden="true"
        tabIndex={-1}
        value={language}
        onChange={(event) => {
          const nextLanguage = event.target.value;
          if (nextLanguage === "en" || nextLanguage === "he") selectLanguage(nextLanguage);
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        type="button"
        className="settings-language-trigger"
        aria-label={t("language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span>{selected.label}</span>
        <ChevronDownIcon className="settings-language-chevron" size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="settings-language-menu" role="listbox" aria-label={t("language")}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === language}
              className={`settings-language-option${option.value === language ? " selected" : ""}`}
              key={option.value}
              onClick={() => selectLanguage(option.value)}
            >
              {option.label}
              {option.value === language && <CheckIcon size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const { language, setLanguage, t, translateError } = useI18n();
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
  const [mentionWebhookSecretCopied, setMentionWebhookSecretCopied] = useState(false);
  const workspaceLogoSrc = useAuthUrl(workspaceLogoUrl);
  const azureIconSrc = useAuthUrl("/azure-devops-icon.svg");
  const allureIconSrc = useAuthUrl("/allure-docker-icon.png");

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
      .catch((err) => !cancelled && setError(translateError(err.message)))
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
      .catch((err) => !cancelled && setError(translateError(err.message)))
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
      .catch((err) => !cancelled && setError(translateError(err.message)))
      .finally(() => !cancelled && setAllureLoading(false));
    return () => { cancelled = true; };
  }, [activeTab, user.isAdmin]);

  const visibleTabs = SETTINGS_TABS.filter((tab) => !tab.adminOnly || user.isAdmin);
  const tabLabels = {
    account: t("account"),
    appearance: t("appearance"),
    preferences: t("preferences"),
    workspace: t("workspace"),
    integrations: t("integrations"),
    desktop: t("desktop"),
    shortcuts: t("shortcuts"),
    api: t("api"),
    mcp: t("mcp"),
    webhooks: t("webhooks"),
  };

  function onAvatarFileSelected(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(t("profilePictureTypeError"));
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
      setError(translateError(err.message));
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
      setError(translateError(err.message));
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!nameChanged) return;
    const nextName = displayName.trim();
    if (!nextName || nextName.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(t("displayNameMaxLength").replace("{count}", String(MAX_DISPLAY_NAME_LENGTH)));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.updateProfile({ displayName: nextName });
      onUpdated(updated);
      flashSaved();
    } catch (err) {
      setError(translateError(err.message));
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
      setError(t("workspaceLogoTypeError"));
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
    if (nextName.length > 80) return setError(t("organizationNameLengthError"));
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
      setError(translateError(err.message));
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
      setError(translateError(err.message));
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
      setError(translateError(err.message));
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
      setError(translateError(err.message));
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
      setError(translateError(err.message));
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
      setMentionWebhookSecretCopied(false);
      setMentionWebhookSaved(true);
    } catch (err) {
      setError(translateError(err.message));
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
      setError(translateError(err.message));
    } finally {
      setMentionWebhookLoading(false);
    }
  }

  async function copyMentionWebhookSecret() {
    if (!mentionWebhook?.signingSecret) return;
    try {
      await navigator.clipboard.writeText(mentionWebhook.signingSecret);
      setMentionWebhookSecretCopied(true);
    } catch {
      setError(t("copySigningSecretError"));
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
      setError(translateError(err.message));
    } finally {
      setAzureLoading(false);
    }
  }

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="settings-layout">
        <aside className="settings-nav" aria-label={t("settingsCategories")}>
          <div className="settings-nav-account">
            <span className="settings-nav-username">@{user.username}</span>
          </div>
          <nav className="settings-nav-list">
            {visibleTabs.map(({ id, label, Icon }) => (
                <button key={id} type="button" className={`settings-nav-item${activeTab === id ? " active" : ""}`} onClick={() => { setActiveTab(id); onSettingsTabChange?.(id); }} aria-current={activeTab === id ? "page" : undefined}>
                <Icon size={17} strokeWidth={1.8} /><span>{tabLabels[id] || label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main className={`settings-content settings-content-${activeTab}`}>
          {activeTab === "account" && <>
            <section className="settings-section settings-profile-section">
              <h3>{t("profile")}</h3>
              <div className="settings-profile-fields">
                <div className="settings-profile-field">
                  <div className="settings-profile-field-label">{t("profilePicture")}</div>
                <div className="settings-avatar-row">
                    <Avatar name={displayName} src={avatarUrl} size={64} />
                  <div className="settings-avatar-actions">
                    <button type="button" className="btn-secondary" data-testid="settings-avatar-button" disabled={busy} onClick={() => setAvatarDialogOpen(true)}>{avatarUrl ? t("change") : t("upload")}</button>
                    {avatarUrl && <button type="button" className="link-danger" data-testid="settings-avatar-remove" disabled={busy} onClick={removeAvatar}>{t("remove")}</button>}
                  </div>
                </div>
                </div>
                <div className="settings-profile-field">
                  <div className="settings-profile-field-label">{t("displayName")}</div>
                <div className="settings-name-row">
                  <input className="settings-input" data-testid="settings-display-name" value={displayName} maxLength={MAX_DISPLAY_NAME_LENGTH} dir="auto" onChange={(e) => setDisplayName(e.target.value)} />
                  <button type="button" className="btn-primary" disabled={!nameChanged || busy} onClick={saveName}>{t("save")}</button>
                </div>
                </div>
              </div>
            </section>
            <section className="settings-section">
              <h3>{t("desktopNotifications")}</h3>
              <p className="settings-hint">{t("desktopNotificationsHint")}</p>
              <NotificationToggle />
            </section>
            {!user.isAdmin ? (user.canChangePassword ? <ChangePassword /> : <SsoPasswordNotice />) : <><AdminPasswordReset users={users} currentUserId={user.id} /><AdminUserDeprecation users={users} currentUserId={user.id} /></>}
          </>}

          {activeTab === "preferences" && <>
            <section className="settings-section" data-testid="preferences-page">
              <h3>{t("notificationDefaults")}</h3>
              <p className="settings-hint">{t("notificationDefaultsHint")}</p>
              <NotificationDefaults />
            </section>
            <section className="settings-section">
              <h3>{t("language")}</h3>
              <LanguageSelect language={language} setLanguage={setLanguage} t={t} />
            </section>
            <section className="settings-section">
              <h3>{t("messageSounds")}</h3>
              <p className="settings-hint">{t("chooseMessageSound")}</p>
              <MessageSoundControls />
            </section>
          </>}

          {activeTab === "webhooks" && <section className="settings-section mention-webhook-settings" data-testid="mention-webhook-settings">
            <div className="mention-webhook-hero">
              <span className="mention-webhook-icon" aria-hidden="true"><WebhookIcon size={22} strokeWidth={2} /></span>
              <div>
                <h3>{t("personalWebhook")}</h3>
                <p>{t("webhookHint")}</p>
              </div>
              <span className={`mention-webhook-status${mentionWebhook?.enabled ? " is-active" : ""}`}>{mentionWebhook?.enabled ? t("webhookActive") : mentionWebhook ? t("webhookPaused") : t("webhookNotConfigured")}</span>
            </div>
            <div className="mention-webhook-card">
              <div className="mention-webhook-field">
                <label className="settings-profile-field-label" htmlFor="mention-webhook-url">{t("destinationUrl")}</label>
                <span>{t("webhookDestinationHint")}</span>
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
                <span><strong>{t("deliverEvents")}</strong><small>{t("deliverEventsHint")}</small></span>
                <span className={`integration-switch${mentionWebhookEnabled ? " is-on" : ""}`}><input type="checkbox" checked={mentionWebhookEnabled} disabled={mentionWebhookLoading} onChange={(event) => { setMentionWebhookEnabled(event.target.checked); setMentionWebhookSaved(false); }} /><span className="integration-switch-track"><span /></span></span>
              </label>
            </div>
            <div className="mention-webhook-actions">
              <button type="button" className="btn-primary" data-testid="mention-webhook-save" disabled={mentionWebhookLoading || !mentionWebhookUrl.trim()} onClick={saveMentionWebhook}>{mentionWebhook ? t("saveWebhook") : t("createWebhook")}</button>
              {mentionWebhook && <button type="button" className="btn-danger-outline" data-testid="mention-webhook-remove" disabled={mentionWebhookLoading} onClick={removeMentionWebhook}>{t("removeWebhook")}</button>}
              {mentionWebhookSaved && <span className="workspace-save-status">Saved ✓</span>}
            </div>
            {mentionWebhook?.signingSecret && <div className="mention-webhook-secret">
              <div>
                <label className="settings-profile-field-label" htmlFor="mention-webhook-secret">{t("signingSecret")}</label>
                <p>Before accepting an event, verify that <code>x-echo-signature</code> is an HMAC-SHA256 of <code>x-echo-timestamp</code>, a period, and the <strong>raw request body</strong>. Keep this secret on your server—never expose it in a browser or commit it.</p>
              </div>
              <div className="mention-webhook-secret-value">
                <input id="mention-webhook-secret" className="settings-input" data-testid="mention-webhook-secret" value={mentionWebhook.signingSecret} readOnly />
                <button type="button" className="btn-secondary" data-testid="mention-webhook-copy-secret" onClick={copyMentionWebhookSecret} aria-live="polite">
                  {mentionWebhookSecretCopied ? <><CheckIcon size={15} /> {t("copied")}</> : t("copy")}
                </button>
              </div>
            </div>}
            {mentionWebhook && <section className="mention-webhook-examples" aria-labelledby="mention-webhook-examples-title">
              <div>
                <h4 id="mention-webhook-examples-title">What Echo sends</h4>
                <p>Echo sends JSON with the event type, recipient, message, channel, and author. The request headers also include <code>x-echo-event</code>, <code>x-echo-delivery</code>, <code>x-echo-timestamp</code>, and <code>x-echo-signature</code>.</p>
              </div>
              <p className="mention-webhook-thread-note"><code>message.id</code> always identifies the exact new message that triggered this event. For a reply in a thread, <code>message.parentId</code> is the root message’s ID; it is <code>null</code> for a top-level message.</p>
              <details open>
                <summary>Someone mentions you <code>user_mentioned</code></summary>
                <pre>{`{
  "id": "7ee0d8e7-…",
  "type": "user_mentioned",
  "occurredAt": "2026-08-30T19:30:00.000Z",
  "recipient": { "id": "…", "username": "${user.username}" },
  "message": {
    "id": "reply-message-id",
    "parentId": "thread-root-message-id",
    "body": "Can you take a look at this?"
  },
  "channel": { "id": "…", "name": "general", "type": "public" },
  "author": { "id": "…", "username": "alex" }
}`}</pre>
              </details>
              <details>
                <summary>Someone sends you a DM <code>direct_message</code></summary>
                <pre>{`{
  "id": "0bb3a1c0-…",
  "type": "direct_message",
  "occurredAt": "2026-08-30T19:31:00.000Z",
  "recipient": { "id": "…", "username": "${user.username}" },
  "message": { "id": "…", "body": "Do you have a minute?" },
  "channel": { "id": "…", "type": "dm" },
  "author": { "id": "…", "username": "alex" }
}`}</pre>
              </details>
            </section>}
          </section>}

          {activeTab === "appearance" && themes.length > 0 && <section className="settings-section settings-appearance-card">
            <h3>{t("appearance")}</h3>
            <p className="settings-hint">{t("chooseColorTheme")}</p>
            <div className="mode-toggle" role="group" aria-label={`${t("light")} / ${t("dark")}`}>
              <button type="button" className={`mode-option${mode === "light" ? " active" : ""}`} data-testid="settings-mode-light" onClick={() => onSelectMode?.("light")} aria-pressed={mode === "light"}>☀ {t("light")}</button>
              <button type="button" className={`mode-option${mode === "dark" ? " active" : ""}`} data-testid="settings-mode-dark" onClick={() => onSelectMode?.("dark")} aria-pressed={mode === "dark"}>☾ {t("dark")}</button>
            </div>
            <div className="theme-grid">
              {themes.map((themeOption) => <button key={themeOption.id} type="button" className={`theme-card${theme === themeOption.id ? " active" : ""}`} data-testid={`settings-theme-${themeOption.id}`} onClick={() => onSelectTheme?.(themeOption.id)} aria-pressed={theme === themeOption.id}>
                <span className="theme-swatch">{themeOption.swatch.map((c, i) => <span key={i} style={{ background: c }} />)}</span><span className="theme-name">{THEME_TRANSLATION_KEYS[themeOption.id] ? t(THEME_TRANSLATION_KEYS[themeOption.id]) : themeOption.label}</span>
              </button>)}
            </div>
          </section>}

          {activeTab === "workspace" && user.isAdmin && <section className="settings-section workspace-branding-section">
            <h3>{t("workspaceIdentity")}</h3>
            <p className="settings-hint">{t("workspaceIdentityDescription")}</p>
            <div className="workspace-branding-layout">
              <div className="workspace-branding-showcase">
                <div className="workspace-branding-preview">
                  <div className="workspace-branding-logo">
                    {workspaceLogoSrc ? <img src={workspaceLogoSrc} alt="" /> : <span className="workspace-branding-fallback">E</span>}
                  </div>
                  <div className="workspace-branding-preview-copy">
                    <span>{t("preview")}</span>
                    <strong>{workspaceName.trim() || t("workspaceOrganizationPlaceholder")}</strong>
                    <small>{t("workspaceNavigationHint")}</small>
                  </div>
                </div>
              </div>
              <div className="workspace-branding-form">
                <div className="workspace-branding-field">
                  <label className="settings-profile-field-label" htmlFor="workspace-name">{t("organizationName")}</label>
                  <input id="workspace-name" className="settings-input" value={workspaceName} maxLength={80} onChange={(event) => setWorkspaceName(event.target.value)} />
                </div>
                <div className="workspace-branding-field">
                  <span className="settings-profile-field-label">{t("logo")}</span>
                  <div className="workspace-logo-picker">
                    <label className="workspace-upload-button" htmlFor="workspace-logo">{t("chooseImage")}</label>
                    <span>{workspaceLogoFile?.name || (workspaceLogoUrl ? t("currentLogoSelected") : t("noLogoSelected"))}</span>
                    <input id="workspace-logo" className="workspace-logo-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onWorkspaceLogoSelected} disabled={busy} />
                  </div>
                  <p className="settings-hint">{t("imageFileTypesHint")}</p>
                </div>
                <div className="workspace-branding-actions">
                  <button type="button" className="btn-primary" disabled={busy} onClick={saveWorkspace}>{t("saveBranding")}</button>
                  {workspaceLogoUrl && <button type="button" className="link-danger" disabled={busy} onClick={removeWorkspaceLogo}>{t("removeLogo")}</button>}
                  {saved && <span className="workspace-save-status">{t("saved")} ✓</span>}
                </div>
              </div>
            </div>
          </section>}

          {activeTab === "integrations" && user.isAdmin && <section className="integration-page">
            <div className="integration-page-heading">
              <div>
                <h2>{t("integrationsTitle")}</h2>
                <p>{t("integrationsDescription")}</p>
              </div>
            </div>
            <div className="integration-card-grid">
            <AIIntegration />
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
                <button type="button" className="btn-secondary" onClick={() => { setJenkinsDownloadError(null); setJenkinsOptionsOpen(true); }}>{t("configure")}</button>
                <span className="integration-card-status">{t("available")}</span>
              </div>
            </article>
            <article className="integration-card">
              <button type="button" className="integration-card-main" onClick={() => setAzureOptionsOpen(true)}>
                <div className="integration-card-icon"><img className="azure-integration-icon" src={azureIconSrc} alt="" /></div>
                <div className="integration-card-copy">
                  <h3>Azure DevOps</h3>
                  <span>Work item links</span>
                  <p>Configure pull request notifications and work item links in one place.</p>
                </div>
              </button>
              <div className="integration-card-footer">
                <button type="button" className="btn-secondary" onClick={() => setAzureOptionsOpen(true)}>{t("configure")}</button>
                <span className="integration-card-status" role="status">{azureLoading ? "Loading…" : azureIntegration?.active ? "Connected" : "Configure"}</span>
              </div>
            </article>
            <article className="integration-card allure-integration-card">
              <button type="button" className="integration-card-main" onClick={() => setAllureOptionsOpen(true)}>
                <div className="integration-card-icon"><img className="allure-integration-icon" src={allureIconSrc} alt="" /></div>
                <div className="integration-card-copy">
                  <h3>allure docker service</h3>
                  <span>{allureIntegration?.enabled ? `${allureIntegration.projects?.length || 0} project channels` : "Not configured"}</span>
                  <p>{allureIntegration?.enabled ? "Latest reports are available in read-only Echo channels." : "Connect an Allure service to create report channels."}</p>
                </div>
              </button>
              <div className="integration-card-footer">
                <button type="button" className="btn-secondary" onClick={() => setAllureOptionsOpen(true)}>{allureIntegration?.enabled ? t("configure") : t("connect")}</button>
                <span className="integration-card-status">{allureIntegration?.enabled ? "Connected" : t("disabled")}</span>
              </div>
            </article>
            </div>
            {jenkinsOptionsOpen && <div className="integration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJenkinsOptionsOpen(false); }}>
              <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="jenkins-integration-title">
                <div className="integration-dialog-header">
                  <div className="integration-dialog-title"><JenkinsIntegrationIcon /><div><h3 id="jenkins-integration-title">Jenkins</h3><p>Pipeline notifications</p></div></div>
                  <CloseButton onClick={() => setJenkinsOptionsOpen(false)} label="Close Jenkins configuration" />
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
                  <div className="integration-dialog-title"><img className="allure-integration-icon" src={allureIconSrc} alt="" /><div><h3 id="allure-integration-title">allure docker service</h3><p>Integration settings</p></div></div>
                  <CloseButton onClick={() => setAllureOptionsOpen(false)} label="Close integration settings" />
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
                    <button type="button" className="btn-primary" disabled={allureLoading || !allureProjects.length || (!allureIntegration?.enabled && !allureSelectedProjects.length)} title={!allureProjects.length ? "Discover projects before connecting" : undefined} onClick={saveAllure}>{allureIntegration?.enabled ? "Save and sync" : t("connectAllure")}</button>
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
            {azureOptionsOpen && <div className="integration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAzureOptionsOpen(false); }}>
              <section className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="azure-integration-title">
                <div className="integration-dialog-header">
                  <div className="integration-dialog-title"><img className="azure-integration-icon" src={azureIconSrc} alt="" /><div><h3 id="azure-integration-title">Azure DevOps</h3><p>Integration settings</p></div></div>
                  <CloseButton onClick={() => setAzureOptionsOpen(false)} label="Close integration settings" />
                </div>
                <div className="integration-dialog-body">
                  {!azureIntegration && <div className="integration-dialog-section"><h4>Pull request notifications</h4><p className="settings-hint">Create a Service Hook endpoint to send pull request and build events from Azure DevOps to Echo.</p><button type="button" className="btn-primary" disabled={azureLoading} onClick={createAzureIntegration}>{azureLoading ? "Connecting…" : "Enable pull request notifications"}</button></div>}
                  {azureIntegration && <>
                    <div className="integration-option-row"><div><strong>Pull request notifications</strong><span>{azureIntegration.active ? "Azure events are enabled" : "Azure events are disabled"}</span></div><label className={`integration-switch${azureIntegration.active ? " is-on" : ""}`}><input type="checkbox" checked={!!azureIntegration.active} disabled={azureLoading} onChange={(event) => setAzureActive(event.target.checked)} /><span className="integration-switch-track"><span /></span></label></div>
                    <div className="integration-dialog-section"><h4>Webhook endpoint</h4><p className="settings-hint">Add this URL to an Azure DevOps Service Hook.</p><input id="azure-webhook-endpoint" className="settings-input" value={azureEndpoint} readOnly /><div className="integration-actions"><button type="button" className="btn-secondary" disabled={!azureEndpoint} onClick={copyAzureEndpoint}>Copy endpoint</button><button type="button" className="btn-secondary" disabled={azureLoading} onClick={regenerateAzureToken}>Regenerate token</button></div></div>
                    <div className="integration-dialog-section"><h4>Events to send</h4><div className="integration-notify-grid">{AZURE_NOTIFY_OPTIONS.map(([key, label]) => <label key={key} className="integration-notify-option"><span>{label}</span><span className={`integration-switch integration-notify-switch${azureIntegration.notify?.[key] !== false ? " is-on" : ""}`}><input type="checkbox" checked={azureIntegration.notify?.[key] !== false} disabled={azureLoading || !azureIntegration.active} onChange={(event) => setAzureNotification(key, event.target.checked)} /><span className="integration-switch-track"><span /></span></span></label>)}</div></div>
                    {azureIntegration.lastReceivedAt && <p className="settings-hint">Last event: {new Date(azureIntegration.lastReceivedAt).toLocaleString()}</p>}
                    {azureIntegration.lastError && <p className="error">{azureIntegration.lastError}</p>}
                  </>}
                  <AzureWorkItemsIntegration embedded />
                </div>
              </section>
            </div>}
          </section>}

          {activeTab === "api" && <ApiDocsPage embedded />}

          {activeTab === "mcp" && <McpSettings />}

          {activeTab === "desktop" && <>
            <DesktopWindowSettings />
            <DesktopDownloads downloads={desktopDownloads} error={desktopDownloadsError} />
          </>}

          {activeTab === "shortcuts" && (
            <section className="settings-section settings-shortcuts-section">
              <h3>{t("keyboardShortcutsTitle")}</h3>
              <p className="settings-hint">{t("keyboardShortcutsHint")}</p>
              <div className="shortcut-groups">
                {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
                  <section className="shortcut-group" key={group.label} aria-labelledby={`shortcut-group-${group.label.toLowerCase()}`}>
                    <h4 id={`shortcut-group-${group.label.toLowerCase()}`}>{group.label === "Navigation" ? t("navigation") : t("messageActionsGroup")}</h4>
                    <div className="shortcut-list">
                      {group.shortcuts.map((shortcut) => (
                        <div className="shortcut-row" key={`${group.label}-${shortcut.description}`}>
                          <span className="shortcut-description">{t(`shortcut${shortcut.id.replace(/(^|-)(\w)/g, (_, __, letter) => letter.toUpperCase())}` as never)}</span>
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
  const { t, translateError } = useI18n();
  if (error) return <section className="settings-section"><h3>{t("desktopApps")}</h3><p className="error">{error}</p></section>;
  if (!downloads) return <section className="settings-section"><h3>{t("desktopApps")}</h3><p className="settings-hint">{t("loadingDownloadOptions")}</p></section>;

  const platforms = [
    { key: "windows", label: "Windows", description: t("windowsDesktopHint") },
    { key: "linux", label: "Linux", description: t("linuxDesktopHint") },
  ];
  return (
    <section className="settings-section desktop-downloads-section">
      <h3>{t("desktopApps")}</h3>
      <p className="settings-hint">{t("desktopAppsHint")}</p>
      <div className="desktop-download-grid">
        {platforms.map(({ key, label, description }) => {
          const download = downloads[key];
          return <article className="desktop-download-card" key={key}>
            <h4>{label}</h4>
            <p>{description}</p>
            {download?.available ? <a className="btn-primary desktop-download-button" href={`${backendOrigin()}${download.url}`} download>{t("downloadFor").replace("{platform}", label)}</a> : <span className="settings-hint">{t("notIncludedDeployment")}</span>}
          </article>;
        })}
      </div>
      {downloads.version && <p className="settings-hint">{t("packageVersion").replace("{version}", downloads.version)}</p>}
    </section>
  );
}

function DesktopWindowSettings() {
  const { t } = useI18n();
  const desktopConfig = window.echoDesktopConfig;
  const nativeDesktop = Boolean(desktopConfig?.appVersion && desktopConfig.toggleFullscreen);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!nativeDesktop || !desktopConfig) return undefined;
    let cancelled = false;
    void desktopConfig.getFullscreen().then((result) => {
      if (!cancelled) setFullScreen(result.fullScreen);
    });
    const removeListener = desktopConfig.onFullscreenChange(setFullScreen);
    return () => {
      cancelled = true;
      removeListener();
    };
  }, [desktopConfig, nativeDesktop]);

  if (!nativeDesktop || !desktopConfig) return null;

  async function toggleFullscreen() {
    const result = await desktopConfig.toggleFullscreen();
    if (result.ok) setFullScreen(result.fullScreen);
  }

  return (
    <section className="settings-section desktop-window-settings" data-testid="desktop-window-settings">
      <h3>{t("desktopWindow")}</h3>
      <p className="settings-hint">{t("desktopWindowHint")}</p>
      <button type="button" className="btn-secondary desktop-fullscreen-button" aria-pressed={fullScreen} aria-label={fullScreen ? t("exitFullscreen") : t("enterFullscreen")} onClick={() => void toggleFullscreen()}>
        {fullScreen ? <Minimize2Icon size={16} aria-hidden="true" /> : <Maximize2Icon size={16} aria-hidden="true" />}
        {fullScreen ? t("exitFullscreen") : t("enterFullscreen")}
      </button>
    </section>
  );
}

const MCP_PLATFORMS = [
  { id: "linux", label: "Linux" },
  { id: "macos", label: "macOS" },
  { id: "windows", label: "Windows" },
];

function mcpTokenSetup(platform, token) {
  const exportLine = `export ECHO_API_TOKEN="${token}"`;
  if (platform === "windows") {
    return `[Environment]::SetEnvironmentVariable("ECHO_API_TOKEN", "${token}", "User")
$env:ECHO_API_TOKEN = "${token}"`;
  }
  const shellProfile = platform === "macos" ? "~/.zshrc" : "~/.bashrc";
  return `grep -qxF '${exportLine}' ${shellProfile} 2>/dev/null || printf '\\n${exportLine}\\n' >> ${shellProfile}
source ${shellProfile}`;
}

function mcpInstallScript(clientId, platform, origin, token) {
  const tokenSetup = mcpTokenSetup(platform, token);
  if (clientId === "codex") {
    return platform === "windows"
      ? `${tokenSetup}\ncodex mcp add echo --url ${origin}/mcp --bearer-token-env-var ECHO_API_TOKEN\ncodex mcp list`
      : `${tokenSetup}\ncodex mcp add echo \\
  --url ${origin}/mcp \\
  --bearer-token-env-var ECHO_API_TOKEN
codex mcp list`;
  }
  const command = clientId === "claude"
    ? `claude mcp add --transport http echo ${origin}/mcp --header "Authorization: Bearer ${token}"`
    : clientId === "opencode"
      ? `opencode mcp add echo --url ${origin}/mcp --header "Authorization=Bearer ${token}"`
      : `kilo mcp add echo --url ${origin}/mcp --header "Authorization=Bearer ${token}"`;
  return `${tokenSetup}\n${command}\n${clientId} mcp list`;
}

const MCP_GUIDES = [
  {
    id: "codex",
    name: "Codex",
    description: "Add Echo to Codex CLI or the Codex IDE extension.",
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "Register Echo as a remote HTTP server in Claude Code.",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Add Echo to your project or global OpenCode configuration.",
  },
  {
    id: "kilo",
    name: "Kilo Code",
    description: "Add Echo to Kilo’s global or project-level JSONC configuration.",
  },
];

function McpSettings() {
  const { t } = useI18n();
  const [selectedClient, setSelectedClient] = useState("codex");
  const [selectedPlatform, setSelectedPlatform] = useState("linux");
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const origin = backendOrigin();
  const mcpUrl = `${origin}/mcp`;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.getApiToken();
      setToken(result.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => current === key ? null : current), 1500);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the text manually.");
    }
  }

  return (
    <section className="settings-section mcp-settings" data-testid="mcp-settings">
      <div className="mcp-settings-heading">
        <div>
          <h3>{t("mcpTitle")}</h3>
          <p className="settings-hint">{t("mcpDescription")}</p>
        </div>
        <span className="mcp-endpoint-badge"><span aria-hidden="true" /> Streamable HTTP</span>
      </div>
      <div className="mcp-token-panel">
        <div>
          <h4>{t("mcpAuthentication")}</h4>
          <p>{t("mcpAuthenticationHint")}</p>
        </div>
        {token ? (
          <div className="token-box mcp-token-box">
            <code className="token-value">{token}</code>
            <button type="button" className="btn-secondary" onClick={() => copy(token, "token")}>
              {copied === "token" ? t("copied") : t("copy")}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={generate}>
            {busy ? t("generating") : t("generateApiToken")}
          </button>
        )}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {token ? <>
        <div className="mcp-client-tabs" role="tablist" aria-label="MCP client setup">
          {MCP_GUIDES.map((guide) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedClient === guide.id}
              aria-controls={`mcp-panel-${guide.id}`}
              id={`mcp-tab-${guide.id}`}
              className={`mcp-client-tab${selectedClient === guide.id ? " is-active" : ""}`}
              key={guide.id}
              onClick={() => setSelectedClient(guide.id)}
            >
              {guide.name}
            </button>
          ))}
        </div>
        {MCP_GUIDES.map((guide) => {
          if (selectedClient !== guide.id) return null;
          const install = mcpInstallScript(guide.id, selectedPlatform, origin, token);
          return (
            <article className="mcp-client-card" key={guide.id} role="tabpanel" id={`mcp-panel-${guide.id}`} aria-labelledby={`mcp-tab-${guide.id}`}>
              <div className="mcp-client-card-heading" dir="ltr">
                <div>
                  <h4>{guide.name}</h4>
                  <p>{guide.description}</p>
                </div>
              </div>
              <div className="mcp-platform-tabs" role="tablist" aria-label="Operating system" dir="ltr">
                {MCP_PLATFORMS.map((platform) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedPlatform === platform.id}
                    className={`mcp-platform-tab${selectedPlatform === platform.id ? " is-active" : ""}`}
                    key={platform.id}
                    onClick={() => setSelectedPlatform(platform.id)}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
              <div className="mcp-code-section">
                <div className="mcp-code-heading">
                  <span>{t("mcpInstallScript")}</span>
                </div>
                <pre dir="ltr"><code>{install}</code></pre>
                <div className="mcp-code-actions">
                  <button type="button" className="mcp-copy-button" onClick={() => copy(install, `install-${guide.id}`)}>
                    {copied === `install-${guide.id}` ? t("copied") : t("copySetup")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </> : <div className="mcp-setup-required">
        <strong>{t("mcpSetupRequired")}</strong>
        <span>{t("mcpSetupRequiredHint")}</span>
      </div>}
    </section>
  );
}

// Enable/disable desktop notifications (requests browser permission on enable).
function NotificationToggle() {
  const { t } = useI18n();
  const [perm, setPerm] = useState(() => notifyPermission());
  const [on, setOn] = useState(() => notifyPref() && notifyPermission() === "granted");

  if (!notifySupported()) {
    return <p className="settings-hint">{t("browserNotificationsUnsupported")}</p>;
  }
  if (perm === "denied") {
    return (
      <p className="settings-hint">
        {t("notificationsBlocked")}
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
        {on ? t("turnOffNotifications") : t("enableDesktopNotifications")}
      </button>
      {on && <span className="notify-on">{t("notificationsOn")}</span>}
    </div>
  );
}

function SsoPasswordNotice() {
  const { t } = useI18n();
  return (
    <section className="settings-section" data-testid="sso-password-settings">
      <h3>{t("password")}</h3>
      <p className="settings-hint">{t("ssoPasswordManaged")}</p>
    </section>
  );
}

// Self-service: change your own password (requires the current one).
function ChangePassword() {
  const { t, translateError } = useI18n();
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
      setError(translateError(err.message));
    }
  });

  return (
    <section className="settings-section">
      <h3>{t("password")}</h3>
      <p className="settings-hint">
        {t("changePasswordHint")}
      </p>
      <div className="pw-form" data-testid="change-password-form">
        <input
          {...currentPasswordField}
          className="settings-input"
          data-testid="current-password"
          type="password"
          placeholder={t("currentPassword")}
          onChange={(e) => {
            setDone(false);
            setError(null);
            currentPasswordField.onChange(e);
          }}
        />
        {errors.currentPassword && <div className="error small">{translateError(errors.currentPassword.message)}</div>}
        <input
          {...newPasswordField}
          className="settings-input"
          data-testid="new-password"
          type="password"
          placeholder={t("newPassword")}
          onChange={(e) => {
            setDone(false);
            setError(null);
            newPasswordField.onChange(e);
          }}
        />
        {errors.newPassword && <div className="error small">{translateError(errors.newPassword.message)}</div>}
        <input
          {...confirmPasswordField}
          className="settings-input"
          data-testid="confirm-new-password"
          type="password"
          placeholder={t("confirmNewPassword")}
          onChange={(e) => {
            setDone(false);
            setError(null);
            confirmPasswordField.onChange(e);
          }}
        />
        {errors.confirmPassword && <div className="error small">{translateError(errors.confirmPassword.message)}</div>}
        <div className="field-hint">{t("passwordRule")}</div>
        <button type="button" className="btn-primary" data-testid="change-password-submit" disabled={isSubmitting} onClick={submit}>
          {isSubmitting ? t("updating") : t("updatePassword")}
        </button>
      </div>
      {done && <div className="settings-saved">{t("passwordUpdated")}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

// Admin-only: pick a user and issue them a one-time password. The admin shares
// it; the user logs in with it and is forced to choose their own new password.
function AdminUserDeprecation({ users, currentUserId }) {
  const { t, translateError } = useI18n();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});
  const normalizedQuery = query.trim().replace(/^@+/, "").toLowerCase();
  const candidates = normalizedQuery
    ? users.map((u) => statusOverrides[u.id] === undefined ? u : { ...u, deprecated: statusOverrides[u.id] })
      .filter((u) => u.id !== currentUserId && !u.isAdmin &&
        (u.displayName.toLowerCase().includes(normalizedQuery) || u.username.toLowerCase().includes(normalizedQuery))).slice(0, 8)
    : [];

  async function toggle(u) {
    setBusyId(u.id);
    setError(null);
    try {
      const { user: updated } = await api.setUserDeprecated(u.id, !u.deprecated);
      setStatusOverrides((previous) => ({ ...previous, [u.id]: !!updated.deprecated }));
    }
    catch (err) { setError(translateError(err.message)); }
    finally { setBusyId(null); }
  }

  return (
    <section className="settings-section" data-testid="admin-deprecation">
      <h3>{t("adminDeprecationTitle")}</h3>
      <p className="settings-hint">{t("adminDeprecationDescription")}</p>
      <input className="settings-input" data-testid="admin-deprecation-search" placeholder={t("findUserByName")} value={query} onChange={(event) => setQuery(event.target.value)} />
      {candidates.length > 0 && <div className="admin-user-results">
        {candidates.map((u) => <div key={u.id} className="search-row" data-testid={`admin-deprecation-user-${u.username}`}>
          <Avatar name={u.displayName} src={u.avatarUrl} size={24} />
          <span className="search-name"><span className="search-name-text">{u.displayName}</span>{u.deprecated && <span className="deprecated-label">{t("deprecatedLabel")}</span>}</span>
          <bdi className="search-handle" dir="ltr">@{u.username}</bdi>
          <button type="button" className="btn-secondary" disabled={busyId === u.id} onClick={() => toggle(u)}>{u.deprecated ? t("restoreUser") : t("deprecateUser")}</button>
        </div>)}
      </div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

function AdminPasswordReset({ users, currentUserId }) {
  const { t, translateError } = useI18n();
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
      setError(translateError(err.message));
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
      <h3>{t("adminOtpTitle")}</h3>
      <p className="settings-hint">{t("adminOtpDescription")}</p>

      <div className="admin-reset" data-testid="admin-reset">
        <div className="admin-user-pick">
          <input
            className="settings-input"
            data-testid="admin-reset-search"
            placeholder={t("findUserByName")}
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
                  <span className="search-name">{u.displayName}{u.deprecated && <span className="deprecated-label">{t("deprecatedLabel")}</span>}</span>
                  <span className="search-handle">@{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && !otp && (
          <button type="button" className="btn-primary" data-testid="admin-reset-issue" disabled={busy} onClick={issue}>
            {busy ? t("issuing") : t("issueOtpFor").replace("{name}", selected.displayName)}
          </button>
        )}

        {otp && (
          <div className="otp-box">
            <div className="settings-saved">
              {t("shareOtpWith").replace("{name}", selected.displayName)}
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
