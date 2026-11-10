import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, WandSparkles } from "lucide-react";
import { api } from "../api.js";
import Modal from "./Modal.js";
import { useI18n } from "../lib/i18n.js";
import { rephraseRenderedDiff } from "../lib/rephraseRenderedDiff.js";

function RephraseLoadingGraphic() {
  return <svg className="rephrase-animation-message" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 7h22a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H24l-11 7v-7a6 6 0 0 1-6-6V13a6 6 0 0 1 6-6Z"/><path className="rephrase-reflow-line rephrase-reflow-line-one" d="M16 17h16"/><path className="rephrase-reflow-line rephrase-reflow-line-two" d="M16 23h12"/><path className="rephrase-reflow-line rephrase-reflow-line-three" d="M16 29h9"/></svg>;
}

export default function RephraseControl({ getDraft, applyDraft, restoreFocus, onError }) {
  const { t } = useI18n();
  const { data: config } = useQuery({ queryKey: ["runtime-config"], queryFn: api.getRuntimeConfig, staleTime: 30000, refetchInterval: 30000 });
  const [state, setState] = useState({ status: "idle", draft: "", text: "", error: "" });
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (state.status === "idle") return undefined;
    const onKeyDown = (event) => {
      if (state.status !== "ready" || event.key !== "Enter" || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      apply();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state]);

  function close() {
    request.current?.abort();
    request.current = null;
    setState({ status: "idle", draft: "", text: "", error: "" });
    restoreFocus();
  }

  async function run() {
    if (state.status === "loading") return;
    const draft = getDraft().trim();
    if (!draft) { onError(t("rephraseEmpty")); return; }
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading", draft, text: "", error: "" });
    try {
      const result = await api.rephraseMessage(draft, controller.signal);
      if (controller.signal.aborted) return;
      if (result.canRephrase === false) setState({ status: "error", draft, text: "", error: result.reason || t("rephraseUnable") });
      else if (result.options?.[0]?.text) setState({ status: "ready", draft, text: result.options[0].text, error: "" });
      else setState({ status: "error", draft, text: "", error: t("rephraseFailed") });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: "error", draft, text: "", error: error.message || t("rephraseFailed") });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function apply() {
    if (getDraft().trim() !== state.draft) { close(); onError(t("rephraseDraftChanged")); return; }
    applyDraft(state.text);
    close();
  }

  if (!config?.threadSummaries) return null;
  const diff = state.status === "ready" ? rephraseRenderedDiff(state.draft, state.text) : null;
  return <>
    <span className="composer-ai-rephrase-control">
      <button type="button" className={`icon-btn composer-ai-rephrase ${state.status !== "idle" ? "active" : ""}`} data-testid="composer-rephrase" title={t("rephraseWithAiBeta")} aria-label={t("rephraseWithAiBeta")} aria-haspopup="dialog" aria-expanded={state.status !== "idle"} disabled={state.status === "loading"} onMouseDown={event => event.preventDefault()} onClick={run}>
        <WandSparkles size={18} strokeWidth={1.8} aria-hidden="true" /><span className="composer-ai-beta" aria-hidden="true">{t("rephraseBeta")}</span>
      </button>
    </span>
    {state.status !== "idle" && <Modal title={<span className="composer-rephrase-modal-title"><WandSparkles size={18} aria-hidden="true" />{t("rephraseWithAi")}<small className="composer-rephrase-beta">{t("rephraseBeta")}</small></span>} className={`composer-rephrase-popover ${state.status === "loading" ? "composer-rephrase-popover-loading" : ""}`} backdropClassName="composer-rephrase-backdrop" testId="composer-rephrase-popover" closeLabel={t("closeRephrase")} onClose={close} onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}>
          {state.status === "loading" && <div className="composer-rephrase-loading" role="status"><span className="composer-rephrase-loading-icon"><RephraseLoadingGraphic /></span><span className="composer-rephrase-loading-text">{t("rephraseLoading")}</span></div>}
          {state.status === "error" && <div className="composer-rephrase-status"><p role="alert">{state.error}</p><div className="composer-rephrase-actions"><button type="button" className="btn-primary" onClick={run}>{t("rephraseRetry")}</button></div></div>}
          {diff && <>
            <div className="composer-rephrase-comparison">
              <section className="composer-rephrase-original" aria-label={t("rephraseBefore")}><span className="composer-rephrase-option-label">{t("rephraseBefore")}</span><div className="composer-rephrase-option-text composer-rephrase-preview composer-rephrase-diff" dir="auto" dangerouslySetInnerHTML={{ __html: diff.before }} /></section>
              <span className="composer-rephrase-arrow" aria-hidden="true"><ArrowRight size={18} /></span>
              <section className="composer-rephrase-result" aria-label={t("rephraseAfter")}><span className="composer-rephrase-option-label">{t("rephraseAfter")}</span><div className="composer-rephrase-option-text composer-rephrase-preview composer-rephrase-diff" dir="auto" dangerouslySetInnerHTML={{ __html: diff.after }} /></section>
            </div>
            {diff.unchanged && <p className="composer-rephrase-unchanged" role="status">{t("rephraseNoChanges")}</p>}
            <div className="composer-rephrase-actions"><button type="button" className="btn-primary" onClick={apply}>{t("useRephrase")}</button></div>
          </>}
    </Modal>}
  </>;
}
