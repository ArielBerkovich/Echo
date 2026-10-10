import { useEffect, useMemo, useRef, useState } from "react";
import { WandSparkles, LoaderCircle, RefreshCw, ArrowRight, Copy, Check, ListChecks, CircleHelp, Flag, Clock3, CheckCircle2 } from "lucide-react";
import DOMPurify from "dompurify";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { useI18n } from "../lib/i18n.js";
import { formatTime } from "../lib/time.js";
import Avatar from "./Avatar.js";
import { CloseButton } from "./Button.js";

const SUMMARY_HTML_TAGS = ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "h1", "h2", "h3", "code", "pre", "blockquote"];

function SummaryText({ text, renderMarkdown, className = "" }) {
  const html = useMemo(() => {
    const value = String(text || "").replace(/&lt;(\/?(?:p|br|strong|em|b|i|ul|ol|li|h[1-3]|code|pre|blockquote))\s*&gt;/gi, "<$1>");
    const hasHtml = /<\/?(?:p|br|strong|em|b|i|ul|ol|li|h[1-3]|code|pre|blockquote)\b[^>]*>/i.test(value);
    return DOMPurify.sanitize(hasHtml ? value : renderMarkdown(value), { ALLOWED_TAGS: SUMMARY_HTML_TAGS, ALLOWED_ATTR: [] });
  }, [text, renderMarkdown]);
  return <div className={`summary-text ${className}`} dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ThreadSummaryPanel({ channel, root, renderMarkdown, onClose, onOpenThread }) {
  const { t } = useI18n();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("brief");
  const [stale, setStale] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [now, setNow] = useState(Date.now());
  const pending = useRef(null);
  const revision = useRef(0);
  const copyTimer = useRef(null);

  const sourceMap = useMemo(() => new Map((result?.sources || []).map((source, index) => [source.id, { ...source, number: index + 1 }])), [result?.sources]);
  const participants = useMemo(() => [...new Map((result?.sources || []).map((source) => [source.authorId || source.author, source])).values()], [result?.sources]);
  const structured = result?.structured;

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
        setNow(Date.now());
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

  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [result?.generatedAt]);

  async function copySummary() {
    const parts = [structured?.overview || result.summary];
    if (structured) {
      const sections = [
        [t("summaryDevelopments"), detail === "detailed" ? structured.developments : []],
        [t("summaryDecisions"), structured.decisions],
        [t("summaryOutcome"), structured.outcome ? [structured.outcome] : []],
        [t("summaryNextSteps"), structured.nextSteps],
        [t("summaryOpenItems"), structured.openItems],
      ];
      for (const [label, points] of sections) if (points?.length) parts.push(`${label}\n${points.map((point) => `• ${point.text}${point.owner ? ` — ${point.owner}` : ""}${point.deadline ? ` (${point.deadline})` : ""}`).join("\n")}`);
    }
    // Copy readable text even when a compatible provider returned HTML.
    const template = document.createElement("template");
    const content = parts.join("\n\n");
    const hasHtml = /<\/?(?:p|br|strong|em|ul|ol|li|h[1-3])\b/i.test(content);
    template.innerHTML = DOMPurify.sanitize(hasHtml ? content : renderMarkdown(content)).replace(/<br\s*\/?>|<\/(?:p|li|h[1-6])>/gi, "$&\n");
    const text = (template.content.textContent || parts.join("\n\n")).trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState(""), 2500);
    } catch { setCopyState("failed"); }
  }

  function references(point) {
    return <div className="summary-references">{(point.sourceIds || []).map((id) => {
      const source = sourceMap.get(id);
      if (!source) return null;
      return <button type="button" key={id} title={t("summaryViewSource")} aria-label={`${t("summaryViewSource")} ${source.number}: ${source.author}`} onClick={() => onOpenThread(id)}>{source.number}<span>{source.author}</span><ArrowRight size={12} aria-hidden="true" /></button>;
    })}</div>;
  }

  function section(label, Icon, points, variant) {
    if (!points?.length) return null;
    return <section className={`summary-section summary-section-${variant}`}>
      <h3><Icon size={16} aria-hidden="true" />{label}</h3>
      <ol className="summary-points">{points.map((point, index) => <li key={index}>
        <SummaryText text={point.text} renderMarkdown={renderMarkdown} />
        {(point.owner || point.deadline) && <div className="summary-task-meta">{point.owner && <span><Avatar name={point.owner} size={20} />{point.owner}</span>}{point.deadline && <span><Clock3 size={13} aria-hidden="true" />{point.deadline}</span>}</div>}
        {references(point)}
      </li>)}</ol>
    </section>;
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
        {(!result || structured) && <div className="summary-view-toggle" role="group" aria-label={t("summaryDetailLevel")}>
          {["brief", "detailed"].map((mode) => <button type="button" key={mode} aria-pressed={detail === mode} onClick={() => setDetail(mode)}>{t(mode === "brief" ? "summaryBrief" : "summaryDetailed")}</button>)}
        </div>}
        <button type="button" className="summary-copy" disabled={!result} onClick={copySummary}>{copyState === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{t(copyState === "copied" ? "summaryCopied" : "summaryCopy")}</button>
      </div>
      <div className="thread-summary-panel-body" aria-busy={loading}>
        <span className="summary-copy-feedback" role="status">{copyState === "failed" ? t("summaryCopyFailed") : copyState === "copied" ? t("summaryCopied") : ""}</span>
        {stale && result && <div className="summary-stale" role="status"><span>{t("summaryDiscussionChanged")}</span><button type="button" disabled={loading} onClick={summarize}>{t("summaryUpdate")}</button></div>}
        {loading && <div className="thread-summary-loading" role="status"><LoaderCircle className="spinner" size={18} aria-hidden="true" /><div>{t("summarizing")}<span>{t("summaryLoadingHint")}</span></div></div>}
        {loading && !result && <div className="summary-skeleton" aria-hidden="true"><div className="summary-skeleton-card"><i /><i /><i /></div><div className="summary-skeleton-card"><i /><i /></div><div className="summary-skeleton-card"><i /><i /><i /></div></div>}
        {error && <div className="thread-summary-error" role="alert"><p>{error}</p><button type="button" onClick={summarize}>{t("retrySummary")}</button></div>}
        {result && <>
          <div className="summary-context-row">
            <div className="summary-avatars" aria-hidden="true">{participants.slice(0, 4).map((participant) => <Avatar key={participant.authorId || participant.author} name={participant.author.replace(/\s*\([^)]*\)\s*$/, "")} size={26} />)}</div>
            <span>{t("summaryReplies").replace("{count}", String(result.replyCount))}</span>
            <time dateTime={result.generatedAt}>{now - new Date(result.generatedAt).getTime() < 60000 ? t("summaryUpdatedNow") : t("summaryUpdatedAt").replace("{time}", formatTime(result.generatedAt))}</time>
          </div>
          <section className="summary-overview"><h3>{t("summaryAtAGlance")}</h3><SummaryText text={structured?.overview || result.summary} renderMarkdown={renderMarkdown} /></section>
          {structured && <>
            {detail === "detailed" && section(t("summaryDevelopments"), Clock3, structured.developments, "timeline")}
            {section(t("summaryDecisions"), ListChecks, structured.decisions, "decisions")}
            {section(t("summaryOutcome"), CheckCircle2, structured.outcome ? [structured.outcome] : [], "outcome")}
            {section(t("summaryNextSteps"), Flag, structured.nextSteps, "tasks")}
            {section(t("summaryOpenItems"), CircleHelp, structured.openItems, "open")}
          </>}
          {!!result.sources?.length && <details className="thread-summary-sources">
            <summary>{t("summarySourceReplies")}</summary>
            <ol>{result.sources.map((source, index) => <li key={source.id}>
              <div className="summary-source-author"><Avatar name={source.author.replace(/\s*\([^)]*\)\s*$/, "")} size={24} /><strong dir="auto">{source.author}</strong><button type="button" title={t("summaryViewSource")} aria-label={`${t("summaryViewSource")} ${index + 1}`} onClick={() => onOpenThread(source.id)}><ArrowRight size={16} aria-hidden="true" /></button></div>
              <p dir="auto">{source.text}</p>{source.attachments?.map((attachment, i) => <span className="thread-summary-source-file" key={i}>{attachment.name}</span>)}
            </li>)}</ol>
          </details>}
        </>}
      </div>
      <footer className="thread-summary-footer"><button type="button" onClick={() => onOpenThread()}>{t("viewSummaryThread")}<ArrowRight size={16} aria-hidden="true" /></button></footer>
    </aside>
  );
}
