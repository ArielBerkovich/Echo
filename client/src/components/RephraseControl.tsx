import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Sparkles, WandSparkles, X } from "lucide-react";
import { api } from "../api.js";
import { useI18n } from "../lib/i18n.js";
import { rephraseRenderedDiff } from "../lib/rephraseRenderedDiff.js";

const loadingAnimations = ["dots", "sparkle", "wave", "spinner", "pencil", "reveal", "message", "character"] as const;
const loadingAnimationStorageKey = "echo.rephrase.loadingAnimation";

function readLoadingAnimation() {
  try {
    const saved = window.localStorage.getItem(loadingAnimationStorageKey);
    return loadingAnimations.includes(saved as typeof loadingAnimations[number]) ? saved as typeof loadingAnimations[number] : "message";
  } catch { return "message"; }
}

function RephraseLoadingGraphic({ type }: { type: typeof loadingAnimations[number] }) {
  if (type === "dots") return <span className="rephrase-animation-dots"><i /><i /><i /></span>;
  if (type === "sparkle") return <Sparkles className="rephrase-animation-sparkle" size={34} strokeWidth={1.6} />;
  if (type === "wave") return <span className="rephrase-animation-wave"><i /><i /><i /><i /></span>;
  if (type === "spinner") return <span className="rephrase-animation-spinner" />;
  if (type === "pencil") return <svg className="rephrase-animation-pencil" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 8h24a4 4 0 0 1 4 4v28H11a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"/><path d="M14 17h14M14 23h12M14 29h9"/><g><path d="m22 34 12-12 4 4-12 12-6 2 2-6Z"/><path d="m31 25 4 4"/></g></svg>;
  if (type === "reveal") return <span className="rephrase-animation-reveal"><i /><i /><i /><b /></span>;
  if (type === "character") return <Bot className="rephrase-animation-character" size={34} strokeWidth={1.5} />;
  return <svg className="rephrase-animation-message" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7h22a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H24l-11 7v-7a6 6 0 0 1-6-6V13a6 6 0 0 1 6-6Z"/><path className="rephrase-reflow-line rephrase-reflow-line-one" d="M16 17h16"/><path className="rephrase-reflow-line rephrase-reflow-line-two" d="M16 23h12"/><path className="rephrase-reflow-line rephrase-reflow-line-three" d="M16 29h9"/></svg>;
}

export default function RephraseControl({ getDraft, applyDraft, restoreFocus, onError }) {
  const { t } = useI18n();
  const { data: config } = useQuery({ queryKey: ["runtime-config"], queryFn: api.getRuntimeConfig, staleTime: 30000, refetchInterval: 30000 });
  const [state, setState] = useState({ status: "idle", draft: "", text: "", error: "" });
  const [loadingAnimation, setLoadingAnimation] = useState(readLoadingAnimation);
  const [showAnimationPicker, setShowAnimationPicker] = useState(false);
  const request = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (state.status === "idle") return undefined;
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) dialogRef.current.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
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

  function chooseLoadingAnimation(type: typeof loadingAnimations[number]) {
    setLoadingAnimation(type);
    try { window.localStorage.setItem(loadingAnimationStorageKey, type); } catch { /* Storage may be disabled. */ }
  }

  if (!config?.threadSummaries) return null;
  const diff = state.status === "ready" ? rephraseRenderedDiff(state.draft, state.text) : null;
  const animationLabels = {
    dots: t("rephraseAnimation_dots"), sparkle: t("rephraseAnimation_sparkle"), wave: t("rephraseAnimation_wave"), spinner: t("rephraseAnimation_spinner"),
    pencil: t("rephraseAnimation_pencil"), reveal: t("rephraseAnimation_reveal"), message: t("rephraseAnimation_message"), character: t("rephraseAnimation_character"),
  };
  return <>
    <span className="composer-ai-rephrase-control">
      <button type="button" className={`icon-btn composer-ai-rephrase ${state.status !== "idle" ? "active" : ""}`} data-testid="composer-rephrase" title={t("rephraseWithAiBeta")} aria-label={t("rephraseWithAiBeta")} aria-haspopup="dialog" aria-expanded={state.status !== "idle"} disabled={state.status === "loading"} onMouseDown={event => event.preventDefault()} onClick={run}>
        <WandSparkles size={18} strokeWidth={1.8} aria-hidden="true" /><span className="composer-ai-beta" aria-hidden="true">Beta</span>
      </button>
    </span>
    {state.status !== "idle" && createPortal(
      <div className="composer-rephrase-screen" onClick={close}>
        <div ref={dialogRef} tabIndex={-1} className={`composer-rephrase-popover ${state.status === "loading" ? "composer-rephrase-popover-loading" : ""} ${showAnimationPicker ? "composer-rephrase-popover-animations" : ""}`} role="dialog" aria-modal="true" aria-labelledby="composer-rephrase-title" data-testid="composer-rephrase-popover" onClick={event => event.stopPropagation()}>
          <div className="composer-rephrase-header">
            <div><strong id="composer-rephrase-title"><WandSparkles size={16} aria-hidden="true" />{t("rephraseWithAi")}<small className="composer-rephrase-beta">{t("rephraseBeta")}</small></strong></div>
            <button type="button" className="composer-rephrase-animations-toggle" aria-expanded={showAnimationPicker} onClick={() => setShowAnimationPicker(value => !value)}>{t("rephraseAnimations")}</button>
            <button type="button" className="composer-rephrase-close" aria-label={t("closeRephrase")} title={t("closeRephrase")} onClick={close}><X size={16} aria-hidden="true" /></button>
          </div>
          {showAnimationPicker && <section className="composer-rephrase-animation-picker" aria-label={t("rephraseChooseAnimation")}><span className="composer-rephrase-option-label">{t("rephraseChooseAnimation")}</span><div className="composer-rephrase-animation-grid" role="group" aria-label={t("rephraseChooseAnimation")}>{loadingAnimations.map(type => <button type="button" key={type} className={`composer-rephrase-animation-choice ${loadingAnimation === type ? "selected" : ""}`} aria-pressed={loadingAnimation === type} onClick={() => chooseLoadingAnimation(type)}><span className="composer-rephrase-animation-preview" aria-hidden="true"><RephraseLoadingGraphic type={type} /></span><span>{animationLabels[type]}</span></button>)}</div></section>}
          {state.status === "loading" && <div className="composer-rephrase-loading" role="status"><span className="composer-rephrase-loading-icon" aria-hidden="true"><RephraseLoadingGraphic type={loadingAnimation} /></span><span className="composer-rephrase-loading-text">{t("rephraseLoading")}</span></div>}
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
        </div>
      </div>, document.body)}
  </>;
}
