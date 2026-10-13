import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import Modal, { ModalActions } from "./Modal.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";

function dateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export default function AzureWorkItemsIntegration({ embedded = false }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["azure-work-items-integration"], queryFn: api.getAzureWorkItemsIntegration });
  const channelsQuery = useQuery({ queryKey: ["workspace", "channels"], queryFn: async () => (await api.listChannels()).channels || [] });
  const [draft, setDraft] = useState(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const integration = query.data?.integration;
  const azureIcon = useAuthUrl("/azure-devops-icon.svg");
  // Channel lists can contain null entries when returned from older/corrupt
  // workspace data. Keep the integration dialog usable so an admin can pick a
  // valid reminder channel instead of crashing the whole settings modal.
  const channels = (Array.isArray(channelsQuery.data) ? channelsQuery.data : []).filter((channel) => channel && channel.type !== "dm" && !channel.isArchived);

  function configure() {
    setDraft({
      enabled: integration?.enabled || false,
      projectUrl: integration?.projectUrl || "",
      expiresAt: dateValue(integration?.expiresAt),
      notifyChannel: integration?.notifyChannel || "",
    });
    setToken("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.saveAzureWorkItemsIntegration({
        ...draft,
        expiresAt: draft.expiresAt ? `${draft.expiresAt}T23:59:59.999Z` : null,
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      queryClient.setQueryData(["azure-work-items-integration"], result);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "settings"] });
      setDraft(null);
      setToken("");
    } catch (err) {
      setError(err.message || "Could not save Azure DevOps settings.");
    } finally {
      setBusy(false);
    }
  }

  // Build the form only after the admin opens it. JSX expressions are
  // evaluated immediately, even if the resulting element is rendered later.
  const editor = draft ? <form onSubmit={save}>
    <p className="settings-hint">Use your Azure DevOps project URL, such as https://dev.azure.com/org/project. Enter the token expiration date shown in Azure DevOps.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="integration-option-row">
        <div><strong id="work-items-enabled-label">Enable work item links</strong><span id="work-items-enabled-hint">Resolve numeric #IDs to Azure DevOps work item titles</span></div>
        <label className={`integration-switch${draft.enabled ? " is-on" : ""}`}>
          <input type="checkbox" role="switch" aria-labelledby="work-items-enabled-label" aria-describedby="work-items-enabled-hint" checked={draft.enabled} onChange={(event) => setDraft((value) => ({ ...value, enabled: event.target.checked }))} />
          <span className="integration-switch-track"><span /></span>
        </label>
      </div>
      <label className="settings-field">Azure DevOps project URL<input className="settings-input" type="url" required={draft.enabled} maxLength={500} placeholder="https://dev.azure.com/org/project" value={draft.projectUrl} onChange={(event) => setDraft((value) => ({ ...value, projectUrl: event.target.value }))} /></label>
      <label className="settings-field">Personal access token<input className="settings-input" type="password" autoComplete="new-password" maxLength={10000} value={token} placeholder={integration?.hasToken ? "Token saved — leave blank to keep" : "Paste a work item read token"} onChange={(event) => setToken(event.target.value)} /></label>
      <label className="settings-field">Token expiration date<input className="settings-input" type="date" required={draft.enabled} value={draft.expiresAt} onChange={(event) => setDraft((value) => ({ ...value, expiresAt: event.target.value }))} /></label>
      <label className="settings-field">Reminder channel<select className="settings-input" required={draft.enabled} value={draft.notifyChannel} onChange={(event) => setDraft((value) => ({ ...value, notifyChannel: event.target.value }))}>
        <option value="">Choose a channel</option>
        {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
      </select></label>
      <p className="settings-hint">Reminders are sent 14 days, 7 days, then daily through the day before expiry. Replacing the token starts a new reminder sequence.</p>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <ModalActions>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save work item settings"}</button>
    </ModalActions>
  </form> : null;

  if (embedded) return <section className="integration-dialog-section azure-work-items-settings">
    <h4>Work item links</h4>
    {integration?.lastError && <p className="error" role="alert">{integration.lastError}</p>}
    {integration?.notifyChannelMissing && <p className="error" role="alert">The reminder channel is unavailable. Choose another channel.</p>}
    {query.isError && <p className="error" role="alert">{query.error.message}</p>}
    {!draft && <div className="integration-work-item-summary">
      <p className="settings-hint">{integration?.enabled ? `Work item links are enabled for ${integration.projectUrl}.` : "Resolve numeric #IDs to Azure DevOps work item titles and notify a channel before the token expires."}</p>
      <button type="button" className="btn-secondary" disabled={!integration && query.isPending} onClick={configure}>{integration ? "Configure work item links" : "Set up work item links"}</button>
      <span className="integration-card-status" role="status">{query.isPending ? "Loading…" : integration?.enabled ? "Enabled" : "Disabled"}</span>
    </div>}
    {draft && editor}
  </section>;

  return <>
    <article className="integration-card">
      <div className="integration-card-main">
        <div className="integration-card-icon"><img className="azure-integration-icon" src={azureIcon} alt="" /></div>
        <div className="integration-card-copy">
          <h3>Azure DevOps work items</h3>
          <span>dev.azure.com</span>
          <p>Show work item titles for #IDs and remind a channel before the token expires.</p>
        </div>
      </div>
      {integration?.lastError && <p className="error" role="alert">{integration.lastError}</p>}
      {integration?.notifyChannelMissing && <p className="error" role="alert">The reminder channel is unavailable. Choose another channel.</p>}
      {query.isError && <p className="error" role="alert">{query.error.message}</p>}
      <div className="integration-card-footer">
        <button type="button" className="btn-secondary" disabled={!integration && query.isPending} onClick={configure}>{integration ? "Configure" : "Set up"}</button>
        <span className="integration-card-status" role="status">{query.isPending ? "Loading…" : integration?.enabled ? "Enabled" : "Disabled"}</span>
      </div>
    </article>
    {draft && <Modal className="ai-integration-modal" closeDisabled={busy} title="Azure DevOps work items" onClose={() => { if (!busy) setDraft(null); }}>
      {editor}
    </Modal>}
  </>;
}
