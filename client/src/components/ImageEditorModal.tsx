import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, Circle, FabricImage, IText, Line, PencilBrush, Rect, Triangle } from "fabric";
import { useAuthUrl } from "../lib/useAuthUrl.js";
import { useI18n } from "../lib/i18n.js";
import { Check, Circle as CircleIcon, Crop, Minus, MousePointer2, Pencil, Redo2, Save, Square, Type, Undo2, X } from "lucide-react";

const ACCENT = "#6f8df7";
const IMAGE_PADDING = 28;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isCropOverlay(object: any) {
  return object?.type === "rect" && Array.isArray(object.strokeDashArray) && object.strokeDashArray.length > 0;
}

function ImageEditorModal({ attachment, onClose, onSave }: {
  attachment: any;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
}) {
  const { t } = useI18n();
  const source = useAuthUrl(attachment.originalPreviewUrl || attachment.originalUrl || attachment.previewUrl || attachment.url);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const imageRef = useRef<FabricImage | null>(null);
  const cropRef = useRef<Rect | null>(null);
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState(ACCENT);
  const [cropEditing, setCropEditing] = useState(false);
  const [historyState, setHistoryState] = useState({ index: -1, length: 0 });
  const historyRef = useRef<any[]>([]);
  const historyIndexRef = useRef(-1);
  const historyLockRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !hostRef.current || !source) return undefined;

    let cancelled = false;
    const canvas = new Canvas(canvasRef.current, {
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = canvas;

    const load = async () => {
      const image = await FabricImage.fromURL(source, { crossOrigin: "anonymous" });
      if (cancelled || !image) return;
      const width = Math.max(hostRef.current?.clientWidth || 900, 320);
      const height = Math.max(hostRef.current?.clientHeight || 560, 280);
      canvas.setDimensions({ width, height });
      const scale = Math.min(
        (width - IMAGE_PADDING * 2) / (image.width || width),
        (height - IMAGE_PADDING * 2) / (image.height || height),
      );
      image.set({
        left: (width - (image.width || width) * scale) / 2,
        top: (height - (image.height || height) * scale) / 2,
        originX: "left",
        originY: "top",
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
      });
      imageRef.current = image;
      canvas.add(image);
      canvas.requestRenderAll();
      const snapshot = canvas.toJSON();
      historyRef.current = [snapshot];
      historyIndexRef.current = 0;
      setHistoryState({ index: 0, length: 1 });
      const recordHistory = () => {
        if (historyLockRef.current) return;
        const next = canvas.toJSON();
        const previous = historyRef.current[historyIndexRef.current];
        if (previous && JSON.stringify(previous) === JSON.stringify(next)) return;
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(next);
        historyIndexRef.current = historyRef.current.length - 1;
        setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
      };
      canvas.on("object:added", recordHistory);
      canvas.on("object:modified", recordHistory);
      canvas.on("object:removed", recordHistory);
      canvas.on("path:created", recordHistory);
      if (!cancelled) setReady(true);
    };

    load().catch((error) => console.error("Could not load image editor source", error));
    return () => {
      cancelled = true;
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [source]);

  const restoreHistory = async (nextIndex: number) => {
    const canvas = fabricRef.current;
    const snapshot = historyRef.current[nextIndex];
    if (!canvas || !snapshot || nextIndex < 0 || nextIndex >= historyRef.current.length) return;
    historyLockRef.current = true;
    try {
      await canvas.loadFromJSON(snapshot);
      canvas.requestRenderAll();
      imageRef.current = canvas.getObjects().find((object) => object.type === "image") as FabricImage || null;
      const restoredCrop = canvas.getObjects().find(isCropOverlay) as Rect || null;
      cropRef.current = restoredCrop;
      setCropEditing(Boolean(restoredCrop?.visible));
      setTool(restoredCrop?.visible ? "crop" : "select");
      historyIndexRef.current = nextIndex;
      setHistoryState({ index: nextIndex, length: historyRef.current.length });
    } finally {
      historyLockRef.current = false;
    }
  };

  const undo = () => restoreHistory(historyIndexRef.current - 1);
  const redo = () => restoreHistory(historyIndexRef.current + 1);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return undefined;
    canvas.isDrawingMode = tool === "pen";
    canvas.selection = tool === "select" || tool === "crop";
    if (canvas.isDrawingMode) {
      const brush = new PencilBrush(canvas);
      brush.color = color;
      brush.width = 5;
      canvas.freeDrawingBrush = brush;
    }
    return undefined;
  }, [tool, color, ready]);

  const changeColor = (nextColor: string) => {
    setColor(nextColor);
    const canvas = fabricRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    if (["i-text", "text", "textbox"].includes(active.type)) active.set("fill", nextColor);
    else active.set("stroke", nextColor);
    canvas.requestRenderAll();
    const next = canvas.toJSON();
    historyRef.current = [...historyRef.current.slice(0, historyIndexRef.current + 1), next];
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
  };

  const addCrop = () => {
    const canvas = fabricRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    if (cropRef.current) canvas.remove(cropRef.current);
    const crop = new Rect({
      left: image.left || IMAGE_PADDING,
      top: image.top || IMAGE_PADDING,
      width: image.getScaledWidth(),
      height: image.getScaledHeight(),
      fill: "rgba(0,0,0,0.02)",
      stroke: ACCENT,
      strokeWidth: 2,
      strokeDashArray: [8, 5],
      cornerColor: "#ffffff",
      cornerStrokeColor: ACCENT,
      cornerStyle: "circle",
      transparentCorners: false,
      padding: 0,
      lockRotation: true,
      minScaleLimit: 0.05,
    });
    cropRef.current = crop;
    canvas.add(crop);
    canvas.setActiveObject(crop);
    canvas.requestRenderAll();
    setCropEditing(true);
  };

  const cancelCrop = () => {
    const canvas = fabricRef.current;
    if (canvas && cropRef.current) canvas.remove(cropRef.current);
    cropRef.current = null;
    setCropEditing(false);
    setTool("select");
    canvas?.requestRenderAll();
  };

  const applyCrop = () => {
    const canvas = fabricRef.current;
    const crop = cropRef.current;
    const image = imageRef.current;
    if (!canvas || !crop || !image) return;
    const scaleX = image.scaleX || 1;
    const scaleY = image.scaleY || 1;
    const cropLeft = clamp(crop.left || 0, image.left || 0, (image.left || 0) + image.getScaledWidth());
    const cropTop = clamp(crop.top || 0, image.top || 0, (image.top || 0) + image.getScaledHeight());
    const cropWidth = clamp(crop.getScaledWidth(), 1, (image.left || 0) + image.getScaledWidth() - cropLeft);
    const cropHeight = clamp(crop.getScaledHeight(), 1, (image.top || 0) + image.getScaledHeight() - cropTop);
    const sourceX = clamp((cropLeft - (image.left || 0)) / scaleX, 0, image.width || cropWidth / scaleX);
    const sourceY = clamp((cropTop - (image.top || 0)) / scaleY, 0, image.height || cropHeight / scaleY);
    image.set({
      cropX: (image.cropX || 0) + sourceX,
      cropY: (image.cropY || 0) + sourceY,
      width: cropWidth / scaleX,
      height: cropHeight / scaleY,
      left: cropLeft,
      top: cropTop,
    });
    canvas.clipPath = new Rect({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight,
      originX: "left",
      originY: "top",
      absolutePositioned: true,
    });
    crop.set({ selectable: false, evented: false, visible: false });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const snapshot = canvas.toJSON();
    historyRef.current = [...historyRef.current.slice(0, historyIndexRef.current + 1), snapshot];
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
    setCropEditing(false);
    setTool("select");
  };

  const addObject = (kind: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const left = canvas.getWidth() / 2 - 80;
    const top = canvas.getHeight() / 2 - 50;
    let object;
    if (kind === "text") {
      object = new IText("Type here", { left, top, fill: color, fontSize: 32, fontFamily: "Arial" });
    } else if (kind === "circle") {
      object = new Circle({ left, top, radius: 65, fill: "transparent", stroke: color, strokeWidth: 5 });
    } else if (kind === "line") {
      object = new Line([left, top, left + 170, top], { stroke: color, strokeWidth: 5 });
    } else if (kind === "triangle") {
      object = new Triangle({ left, top, width: 140, height: 120, fill: "transparent", stroke: color, strokeWidth: 5 });
    } else {
      object = new Rect({ left, top, width: 160, height: 110, fill: "transparent", stroke: color, strokeWidth: 5 });
    }
    canvas.add(object);
    canvas.setActiveObject(object);
    if (kind === "text") object.enterEditing();
    canvas.requestRenderAll();
    setTool("select");
  };

  const save = async () => {
    const canvas = fabricRef.current;
    const image = imageRef.current;
    if (!canvas || !image || saving) return;
    setSaving(true);
    const crop = cropRef.current;
    const cropLeft = crop ? clamp(crop.left || 0, image.left || 0, (image.left || 0) + image.getScaledWidth()) : image.left || 0;
    const cropTop = crop ? clamp(crop.top || 0, image.top || 0, (image.top || 0) + image.getScaledHeight()) : image.top || 0;
    const cropWidth = crop ? clamp(crop.getScaledWidth(), 1, (image.left || 0) + image.getScaledWidth() - cropLeft) : image.getScaledWidth();
    const cropHeight = crop ? clamp(crop.getScaledHeight(), 1, (image.top || 0) + image.getScaledHeight() - cropTop) : image.getScaledHeight();
    if (crop) canvas.remove(crop);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const multiplier = (image.width || cropWidth) / image.getScaledWidth();
    const dataUrl = canvas.toDataURL({ format: "jpeg", quality: 1, left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight, multiplier });
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await onSave(new File([blob], `${attachment.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }));
      onClose();
    } catch (error) {
      console.error("Could not save edited image", error);
      if (crop) {
        cropRef.current = crop;
        canvas.add(crop);
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!ready) return undefined;
    const handleEditorKeyDown = (event: KeyboardEvent) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (modifier && key === "z") {
          if (active?.isEditing) return;
          event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
        }
        if (modifier && key === "y") {
          if (active?.isEditing) return;
          event.preventDefault();
        redo();
        return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && !canvas.getActiveObject()?.isEditing) {
          if (!active || active === imageRef.current || active === cropRef.current) return;
          event.preventDefault();
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
    };
    window.addEventListener("keydown", handleEditorKeyDown);
    return () => window.removeEventListener("keydown", handleEditorKeyDown);
  }, [ready]);

  const button = (active: boolean, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" className={`image-editor-tool${active ? " active" : ""}`} onClick={onClick} aria-label={label} title={label}>
      {icon}<span>{label}</span>
    </button>
  );

  return createPortal(
    <div className="custom-image-editor-shell">
      <section className="custom-image-editor" role="dialog" aria-label={t("editImage")}>
        <header className="custom-image-editor-header">
          <button type="button" className="image-editor-close" onClick={onClose} aria-label={t("cancel")} title={t("cancel")}><X size={21} /></button>
          <div className="image-editor-history">
            <button type="button" className="image-editor-nav" onClick={undo} disabled={historyState.index <= 0} aria-label={t("undo")} title={t("undo")}><Undo2 size={18} /></button>
            <button type="button" className="image-editor-nav" onClick={redo} disabled={historyState.index < 0 || historyState.index >= historyState.length - 1} aria-label={t("redo")} title={t("redo")}><Redo2 size={18} /></button>
          </div>
          <strong>{t("editImage")}</strong>
          <button type="button" className="image-editor-save" onClick={save} disabled={!ready || saving}>{saving ? t("loading") : t("save")} <Save size={16} /></button>
        </header>
        <div className="custom-image-editor-body">
          <div className="custom-image-editor-canvas" ref={hostRef}>
            {!ready && <div className="image-editor-loading" role="status">{t("loading")}</div>}
            <canvas ref={canvasRef} />
          </div>
          <nav className="custom-image-editor-toolbar" aria-label={t("editImage")}>
            {cropEditing && (
              <>
                <button type="button" className="image-editor-crop-action cancel" onClick={cancelCrop}>{t("imageEditorCancelCrop")}</button>
                <button type="button" className="image-editor-crop-action apply" onClick={applyCrop}>{t("imageEditorApplyCrop")}</button>
              </>
            )}
            <label className="image-editor-color" title={t("imageEditorChooseColor")}>
              <span>{t("imageEditorColor")}</span>
              <input type="color" value={color} onChange={(event) => changeColor(event.target.value)} aria-label={t("imageEditorChooseColor")} />
            </label>
            {button(tool === "select", t("imageEditorSelect"), <MousePointer2 size={19} />, () => setTool("select"))}
            {button(tool === "crop", t("imageEditorCrop"), <Crop size={19} />, () => { setTool("crop"); addCrop(); })}
            {button(tool === "pen", t("imageEditorPen"), <Pencil size={19} />, () => setTool("pen"))}
            {button(false, t("imageEditorText"), <Type size={19} />, () => addObject("text"))}
            {button(false, t("imageEditorRectangle"), <Square size={19} />, () => addObject("rect"))}
            {button(false, t("imageEditorCircle"), <CircleIcon size={19} />, () => addObject("circle"))}
            {button(false, t("imageEditorLine"), <Minus size={19} />, () => addObject("line"))}
            {button(false, t("imageEditorTriangle"), <Check size={19} />, () => addObject("triangle"))}
          </nav>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default ImageEditorModal;
