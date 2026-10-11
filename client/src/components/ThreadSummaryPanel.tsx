import { useEffect, useRef, useState } from "react";
import { WandSparkles, LoaderCircle, RefreshCw, ArrowRight, Copy, Check } from "lucide-react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { useI18n } from "../lib/i18n.js";
import { CloseButton } from "./Button.js";

export default function ThreadSummaryPanel({ channel, root, onClose, onOpenThread }) {
  const { t } = useI18n();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [copyState, setCopyState] = useState("");
  const pending = useRef(null);
  const revision = useRef(0);
  const copyTimer = useRef(null);

  async function summarize() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const startedAtRevision = revision.current;
    setLoading(true);
    setError("");
    setCopyState("");
    try {
      const response = await api.summarizeThread(channel.id, root.id, controller.signal);
      if (!controller.signal.aborted) {
        setResult(response);
        setStale(revision.current !== startedAtRevision);
      }
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message || t("threadSummaryFailed"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    setResult(null);
    summarize();
    return () => { pending.current?.abort(); clearTimeout(copyTimer.current); };
  }, [channel.id, root.id]);

  useEffect(() => {
    const socket = getSocket();
    const changed = (message) => {
      if (message.channelId !== channel.id || (message.parentId !== root.id && message.id !== root.id)) return;
      revision.current += 1;
      setStale(true);
    };
    let connectedBefore = socket.connected;
    const reconnect = () => {
      if (connectedBefore) { revision.current += 1; setStale(true); }
      connectedBefore = true;
    };
    socket.on("message:new", changed);
    socket.on("message:update", changed);
    socket.on("message:deleted", changed);
    socket.on("connect", reconnect);
    return () => {
      socket.off("message:new", changed);
      socket.off("message:update", changed);
      socket.off("message:deleted", changed);
      socket.off("connect", reconnect);
    };
  }, [channel.id, root.id]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopyState("copied");
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState(""), 2500);
    } catch { setCopyState("failed"); }
  }

  return (
    <aside className="thread-summary-panel" data-testid="thread-summary-panel" aria-label={t("threadSummary")}>
      <header className="thread-summary-panel-header">
        <div className="thread-summary-panel-title">
          <span className="thread-summary-panel-icon"><WandSparkles size={18} aria-hidden="true" /></span>
          <div><h2>{t("summaryCatchUp")}</h2><span>{t("generatedFromReplies")}</span></div>
        </div>
        <div className="thread-summary-panel-actions">
          <button type="button" className="thread-summary-regenerate" disabled={loading} aria-label={t("regenerateSummary")} title={t("regenerateSummary")} onClick={summarize}><RefreshCw size={16} className={loading ? "spinner" : ""} aria-hidden="true" /></button>
          <CloseButton size="sm" onClick={onClose} label={t("dismissSummary")} />
        </div>
      </header>
      <div className="summary-toolbar">
        <button type="button" className="summary-copy" disabled={!result} onClick={copySummary}>{copyState === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{t(copyState === "copied" ? "summaryCopied" : "summaryCopy")}</button>
      </div>
      <div className="thread-summary-panel-body" aria-busy={loading}>
        <span className="summary-copy-feedback" role="status">{copyState === "failed" ? t("summaryCopyFailed") : copyState === "copied" ? t("summaryCopied") : ""}</span>
        {stale && result && <div className="summary-stale" role="status"><span>{t("summaryDiscussionChanged")}</span><button type="button" disabled={loading} onClick={summarize}>{t("summaryUpdate")}</button></div>}
        {loading && <div className="thread-summary-loading" role="status"><LoaderCircle className="spinner" size={18} aria-hidden="true" /><div>{t("summarizing")}<span>{t("summaryLoadingHint")}</span></div></div>}
        {error && <div className="thread-summary-error" role="alert"><p>{error}</p><button type="button" onClick={summarize}>{t("retrySummary")}</button></div>}
        {result && <div className="thread-summary-plain-text" dir="auto">{result.summary}</div>}
      </div>
      <footer className="thread-summary-footer"><button type="button" onClick={() => onOpenThread()}>{t("viewSummaryThread")}<ArrowRight size={16} aria-hidden="true" /></button></footer>
    </aside>
  );
}
