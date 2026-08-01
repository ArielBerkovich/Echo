import { useEffect, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import Modal, { ModalActions } from "./Modal.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 512;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

export default function ProfilePictureDialog({
  file = null,
  currentSrc = null,
  onFileSelected,
  onSave,
  onClose,
  title = "Update profile picture",
  previewAlt = "Profile preview",
  preserveTransparency = false,
  outputName = "profile-picture.jpg",
}) {
  const imageRef = useRef(null);
  const fileRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const currentImageUrl = useAuthUrl(currentSrc);
  const sourceUrl = file ? imageUrl : currentImageUrl;

  function importFile(event) {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (nextFile) onFileSelected(nextFile);
  }

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = imageSize
    ? Math.min(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height)
    : 1;
  const scale = imageSize
    ? baseScale * zoom
    : 1;
  const displayWidth = (imageSize?.width || PREVIEW_SIZE) * scale;
  const displayHeight = (imageSize?.height || PREVIEW_SIZE) * scale;

  function limitOffset(next, nextScale = scale) {
    const maxX = Math.max(0, (imageSize.width * nextScale - PREVIEW_SIZE) / 2);
    const maxY = Math.max(0, (imageSize.height * nextScale - PREVIEW_SIZE) / 2);
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }

  function changeZoom(event) {
    const nextZoom = 1 + Number(event.target.value) / 100 * 2;
    setZoom(nextZoom);
    setOffset((current) => limitOffset(current, baseScale * nextZoom));
  }

  function onPointerDown(event) {
    if (!imageSize || saving) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    event.currentTarget.dataset.startX = String(event.clientX);
    event.currentTarget.dataset.startY = String(event.clientY);
    event.currentTarget.dataset.offsetX = String(offset.x);
    event.currentTarget.dataset.offsetY = String(offset.y);
  }

  function onPointerMove(event) {
    if (!dragging || !imageSize) return;
    const startX = Number(event.currentTarget.dataset.startX);
    const startY = Number(event.currentTarget.dataset.startY);
    const startOffset = {
      x: Number(event.currentTarget.dataset.offsetX),
      y: Number(event.currentTarget.dataset.offsetY),
    };
    setOffset(limitOffset({
      x: startOffset.x + event.clientX - startX,
      y: startOffset.y + event.clientY - startY,
    }));
  }

  function stopDragging() {
    setDragging(false);
  }

  async function save() {
    if (!imageRef.current || !imageSize || saving) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!preserveTransparency) {
        context.fillStyle = "#111827";
        context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      }
      const outputScale = OUTPUT_SIZE / PREVIEW_SIZE;
      const outputWidth = displayWidth * outputScale;
      const outputHeight = displayHeight * outputScale;
      context.drawImage(
        imageRef.current,
        (OUTPUT_SIZE - outputWidth) / 2 + offset.x * outputScale,
        (OUTPUT_SIZE - outputHeight) / 2 + offset.y * outputScale,
        outputWidth,
        outputHeight
      );
      const cropped = await new Promise((resolve, reject) => {
        const mimeType = preserveTransparency ? "image/png" : "image/jpeg";
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop image"))), mimeType, preserveTransparency ? undefined : 0.9);
      });
      await onSave(new File([cropped], outputName, { type: preserveTransparency ? "image/png" : "image/jpeg" }));
    } catch (saveError) {
      setError(saveError.message || "Could not save profile picture");
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} closeDisabled={saving} testId="profile-picture-dialog">
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="profile-picture-import-input" onChange={importFile} />
      <div
        className={`profile-picture-crop${dragging ? " dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        {sourceUrl ? (
          <img
            ref={imageRef}
            src={sourceUrl}
            alt={previewAlt}
            className="profile-picture-crop-image"
            style={{ width: displayWidth, height: displayHeight, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            draggable="false"
          />
        ) : (
          <button type="button" className="profile-picture-import-empty" onClick={() => fileRef.current?.click()}>
            Import an image
          </button>
        )}
        {sourceUrl && <div className="profile-picture-crop-frame" aria-hidden="true" />}
      </div>
      <button type="button" className="btn-secondary profile-picture-import-button" onClick={() => fileRef.current?.click()} disabled={saving}>
        <UploadIcon size={16} strokeWidth={2} /><span>Import a different image</span>
      </button>
      <label className="profile-picture-zoom">
        <span>Zoom</span>
        <input type="range" min="0" max="100" step="1" value={Math.round((zoom - 1) * 50)} onChange={changeZoom} disabled={!imageSize || saving} />
      </label>
      {error && <div className="error">{error}</div>}
      <ModalActions>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={!imageSize || saving}>{saving ? "Saving…" : "Use this picture"}</button>
      </ModalActions>
    </Modal>
  );
}
