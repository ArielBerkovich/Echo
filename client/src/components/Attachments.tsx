import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, ExpandIcon, FileIcon } from "lucide-react";
import { formatSize } from "../lib/format.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";
import { highlightFile, languageForFilename } from "../lib/syntaxHighlight.js";

// Renders a message's attachments: images inline, everything else as a
// downloadable file chip. Pass onOpenLightbox(src, name) to delegate image
// opening to a parent (e.g. a side-panel lightbox when a thread is open).
export default function Attachments({ attachments = [], onOpenLightbox }) {
  if (!attachments.length) return null;
  return (
    <div className="attachments">
      {attachments.map((a) =>
        a.isImage
          ? <ImageAttachment key={a.key} a={a} onOpenLightbox={onOpenLightbox} />
          : isTextAttachment(a)
            ? <TextAttachment key={a.key} a={a} />
          : <FileAttachment key={a.key} a={a} />
      )}
    </div>
  );
}

const TEXT_EXTENSIONS = /\.(txt|csv|tsv|log|md|markdown|json|xml|yaml|yml|toml|ini|conf|env|css|js|jsx|ts|tsx|html)$/i;

function isTextAttachment(a) {
  const type = String(a.contentType || "").toLowerCase();
  return type.startsWith("text/") || ["application/json", "application/xml"].includes(type) || TEXT_EXTENSIONS.test(a.name || "");
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

function Lightbox({ src, name, onClose, inline = false }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * (e.deltaY < 0 ? 1.15 : 0.87)));
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const onMouseDown = (e) => {
    if (scale <= 1) return;
    dragging.current = true;
    didDrag.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!dragging.current) return;
    didDrag.current = true;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const onMouseUp = () => { dragging.current = false; };

  const handleBackdropClick = () => {
    if (scale > 1) { setScale(1); setOffset({ x: 0, y: 0 }); }
    else onClose();
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = name;
    a.click();
  };

  const content = (
    <div
      className={inline ? "lightbox-panel" : "lightbox-backdrop"}
      data-testid="attachment-lightbox"
      onClick={inline ? undefined : handleBackdropClick}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-img-wrap">
          <img
            src={src}
            alt={name}
            className="lightbox-img"
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              cursor: scale > 1 ? "grab" : "zoom-in",
              transition: dragging.current ? "none" : "transform 0.15s ease",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (didDrag.current) return;
              if (scale > 1) { setScale(1); setOffset({ x: 0, y: 0 }); }
              else setScale(2.5);
            }}
          />
          <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
          <button className="lb-tool" data-testid="lightbox-download" onClick={handleDownload} title="Download">
            <DownloadIcon size={18} strokeWidth={2} />
          </button>
<input
            type="range"
            className="lb-zoom-slider"
            data-testid="lightbox-zoom"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.1}
            value={scale}
            onChange={(e) => {
              const next = Number(e.target.value);
              setScale(next);
              if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
            }}
            title={`Zoom: ${Math.round(scale * 100)}%`}
          />
          <span className="lb-zoom-label" data-testid="lightbox-zoom-label">{Math.round(scale * 100)}%</span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function ImageAttachment({ a, onOpenLightbox }) {
  const src = useAuthUrl(a.url);
  const [open, setOpen] = useState(false);
  const [intrinsicSize, setIntrinsicSize] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const sourceWidth = a.width || intrinsicSize?.width;
  const sourceHeight = a.height || intrinsicSize?.height;
  const ratio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 16 / 9;
  const scale = sourceWidth && sourceHeight
    ? Math.min(1, 360 / sourceWidth, 320 / sourceHeight)
    : 1;
  const reservedWidth = sourceWidth ? Math.max(48, Math.round(sourceWidth * scale)) : 320;

  const handleClick = () => {
    if (onOpenLightbox) onOpenLightbox(src, a.name);
    else setOpen(true);
  };

  return (
    <>
      <button
        className={`att-image${loaded ? " is-loaded" : " is-loading"}`}
        data-testid={`image-attachment-${a.key}`}
        onClick={handleClick}
        title={a.name}
        disabled={!src}
        style={{ width: `${reservedWidth}px`, aspectRatio: String(ratio), cursor: src ? "zoom-in" : "default" }}
      >
        {src && (
          <img
            src={src}
            alt={a.name}
            loading="lazy"
            onLoad={(event) => {
              setIntrinsicSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
              setLoaded(true);
            }}
            onError={() => setLoaded(true)}
          />
        )}
      </button>
      {open && <Lightbox src={src} name={a.name} onClose={() => setOpen(false)} />}
    </>
  );
}

// Exported so ChannelView can render the zoomable image inside a side panel.
export function LightboxImage({ src, name, onClose }) {
  return <Lightbox src={src} name={name} onClose={onClose} inline />;
}

function FileAttachment({ a }) {
  const src = useAuthUrl(a.url);
  return (
    <a
      className="att-file"
      data-testid={`file-attachment-${a.key}`}
      href={src ? `${src}` : undefined}
      onClick={(e) => {
        if (!src) { e.preventDefault(); return; }
        // For downloads, fetch with auth and trigger a save dialog.
        e.preventDefault();
        const link = document.createElement("a");
        link.href = src;
        link.download = a.name;
        link.click();
      }}
      title={a.name}
    >
          <span className="att-file-icon">
        <FileIcon size={20} strokeWidth={1.5} />
      </span>
      <span className="att-file-info">
        <span className="att-file-name">{a.name}</span>
        <span className="att-file-meta">{formatSize(a.size)}</span>
      </span>
    </a>
  );
}

function TextAttachment({ a }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const src = useAuthUrl(a.url);
  const [text, setText] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!src) return undefined;
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error("preview failed");
        return response.text();
      })
      .then((value) => {
        if (!cancelled) setText(value.slice(0, 120_000));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const preview = text?.slice(0, 1_600);
  const truncated = text != null && text.length > 1_600;
  const language = languageForFilename(a.name);
  const languageLabel = language === "plaintext" ? "Text" : language[0].toUpperCase() + language.slice(1);
  // Syntax highlighting is intentionally deferred until the full-screen
  // viewer is opened; attachment cards should stay cheap in long timelines.
  const highlightedText = open && text != null ? highlightFile(text, a.name) : null;
  return (
    <>
      <div className="att-text" data-testid={`text-attachment-${a.key}`}>
      <div className="att-text-head">
        <button
          type="button"
          className="att-text-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="att-file-icon"><FileIcon size={20} strokeWidth={1.5} /></span>
          <span className="att-file-info">
            <span className="att-file-name">{a.name}</span>
            <span className="att-file-meta">{languageLabel} · {formatSize(a.size)}</span>
          </span>
          <span className="att-text-chevron" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
        </button>
        <a
          className="att-text-download"
          href={src || undefined}
          download={a.name}
          title="Download file"
          aria-label={`Download ${a.name}`}
        >
          <DownloadIcon size={17} strokeWidth={2} />
        </a>
        <button
          type="button"
          className="att-text-open att-text-header-open"
          onClick={() => setOpen(true)}
          title="Open full-screen preview"
          aria-label={`Open full-screen preview of ${a.name}`}
        >
          <ExpandIcon size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {expanded && <pre className="att-text-preview">{preview ?? (failed ? "Preview unavailable" : "Loading preview…")}{truncated ? "\n…" : ""}</pre>}
      {expanded && text != null && (
        <div className="att-text-footer">
          <span className="att-text-limit">{truncated ? "Preview truncated" : "Text preview"}</span>
        </div>
      )}
      </div>
      {open && createPortal(
        <div className="text-viewer-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${a.name}`} onClick={() => setOpen(false)}>
          <div className="text-viewer" onClick={(event) => event.stopPropagation()}>
            <div className="text-viewer-head">
              <strong>{a.name}</strong>
              <div className="text-viewer-actions">
                <a href={src || undefined} download={a.name}>Download</a>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close preview" title="Close preview">×</button>
              </div>
            </div>
            <pre className="text-viewer-content">{highlightedText ? <code dangerouslySetInnerHTML={{ __html: highlightedText }} /> : "Loading preview…"}</pre>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
