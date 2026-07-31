import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, FileIcon } from "lucide-react";
import { formatSize } from "../lib/format.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";

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
          : <FileAttachment key={a.key} a={a} />
      )}
    </div>
  );
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
          <button className="lb-tool" onClick={handleDownload} title="Download">
            <DownloadIcon size={18} strokeWidth={2} />
          </button>
<input
            type="range"
            className="lb-zoom-slider"
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
          <span className="lb-zoom-label">{Math.round(scale * 100)}%</span>
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
