import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { api } from "../api.js";
import Modal, { ModalActions } from "./Modal.js";

const numericFields = [["timeoutMs", "Request timeout (milliseconds)", 1000, 300000], ["maxContextTokens", "Context token limit", 1000, 2000000], ["maxOutputTokens", "Output token limit", 100, 100000]];

export default function AIIntegration() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["ai-integration"], queryFn: api.getAIIntegration });
  const [draft, setDraft] = useState(null);
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const integration = query.data?.integration;
  const change = (name, value) => { setDraft(current => ({ ...current, [name]: value })); };
  function openSettings() {
    setDraft({ ...integration }); setKey(""); setClearKey(false); setError("");
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const { hasApiKey, ...settings } = draft;
      const result = await api.saveAIIntegration({ ...settings, ...(clearKey ? { apiKey: "" } : key.trim() ? { apiKey: key } : {}) });
      queryClient.setQueryData(["ai-integration"], result);
      await queryClient.invalidateQueries({ queryKey: ["runtime-config"] });
      setDraft(null); setKey(""); setClearKey(false);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <>
    <article className="integration-card">
      <button type="button" className="integration-card-main" disabled={!integration || busy} onClick={openSettings}>
        <div className="integration-card-icon ai-integration-icon"><Bot size={34} strokeWidth={1.8} aria-hidden="true" /></div>
        <div className="integration-card-copy"><h3>AI</h3><p>Thread summaries through an OpenAI-compatible provider.</p></div>
      </button>
      <div className="integration-card-footer">
        <button type="button" className="btn-secondary" disabled={!integration || busy} onClick={openSettings}>Configure</button>
        <span className="integration-card-status" role="status">{query.isPending ? "Loading…" : integration?.enabled ? "Enabled" : "Disabled"}</span>
      </div>
      {query.isError && <div role="alert" className="error">{query.error.message}<button type="button" className="btn-secondary" onClick={() => query.refetch()}>Retry</button></div>}
    </article>
    {draft && <Modal className="ai-integration-modal" closeDisabled={busy} title={<span className="ai-integration-title"><span className="ai-integration-icon"><Bot size={26} strokeWidth={1.8} aria-hidden="true" /></span>AI integration</span>} onClose={() => { if (!busy) setDraft(null); }}>
      <form onSubmit={save}>
        <p className="settings-hint">Enable thread summaries for the workspace. Thread content is sent to the configured provider when someone requests a summary.</p>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="integration-option-row">
            <div><strong id="ai-enable-label">Enable AI thread summaries</strong><span id="ai-enable-hint">{draft.enabled ? "Summaries are enabled for the workspace" : "Summaries are disabled for the workspace"}</span></div>
            <label className={`integration-switch${draft.enabled ? " is-on" : ""}`}>
              <input type="checkbox" role="switch" aria-labelledby="ai-enable-label" aria-describedby="ai-enable-hint" checked={draft.enabled} onChange={event => change("enabled", event.target.checked)} />
              <span className="integration-switch-track"><span /></span>
            </label>
          </div>
          <label className="settings-field">Provider base URL<input className="settings-input" type="url" required maxLength={500} value={draft.baseUrl} onChange={event => change("baseUrl", event.target.value)} /></label>
          <label className="settings-field">Model<input className="settings-input" required maxLength={200} value={draft.model} onChange={event => change("model", event.target.value)} /></label>
          <label className="settings-field">API key (optional)<input className="settings-input" type="password" autoComplete="new-password" maxLength={10000} disabled={clearKey} value={key} placeholder={draft.hasApiKey ? "Key saved — leave blank to keep" : "No key saved"} onChange={event => { setKey(event.target.value); }} /></label>
          {draft.hasApiKey && <label className="integration-notify-option"><span>Remove saved API key</span><span className={`integration-switch${clearKey ? " is-on" : ""}`}><input type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); }} /><span className="integration-switch-track"><span /></span></span></label>}
          <div className="settings-field">
            <label htmlFor="ai-prompt-prefix">Fixed summarization prefix</label>
            <textarea id="ai-prompt-prefix" className="settings-input ai-prompt-prefix" rows={4} readOnly value={query.data?.promptPrefix || ""} aria-describedby="ai-prompt-help" />
          </div>
          <div className="settings-field">
            <label htmlFor="ai-summary-prompt">Summary prompt</label>
            <textarea id="ai-summary-prompt" className="settings-input" rows={6} maxLength={4000} value={draft.prompt || ""} onChange={event => change("prompt", event.target.value)} aria-describedby="ai-prompt-help" />
          </div>
          <p id="ai-prompt-help" className="settings-hint">Your instructions follow the fixed prefix. Customize the language, length, or focus. Leave blank to use only the prefix.</p>
          {numericFields.map(([name, label, min, max]) => <label className="settings-field" key={name}>{label}<input className="settings-input" type="number" required min={min} max={max} step="1" value={draft[name]} onChange={event => change(name, event.target.value === "" ? "" : Number(event.target.value))} /></label>)}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <ModalActions><button type="button" className="btn-secondary" disabled={busy} onClick={() => setDraft(null)}>Close</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></ModalActions>
      </form>
    </Modal>}
  </>;
}
