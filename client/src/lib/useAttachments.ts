import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { uploadSizeError } from "./uploads.js";

function readImageSize(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve(null);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

function createPendingAttachment(file) {
  const isImage = file.type.startsWith("image/");
  const tempId = crypto.randomUUID();
  return {
    key: tempId,
    tempId,
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
  };
}

function revokePreview(attachment) {
  if (attachment?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(attachment.previewUrl);
}

export function useAttachments({ captureScreenDrops, onError }) {
  const [pending, setPending] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const fileInputRef = useRef(null);
  const pendingRef = useRef([]);
  const dragDepthRef = useRef(0);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => () => pendingRef.current.forEach(revokePreview), []);

  const stageFiles = useCallback(async (files) => {
    if (!files.length) return;
    onErrorRef.current?.(null);
    const sizeError = uploadSizeError(files);
    if (sizeError) return onErrorRef.current?.(sizeError);

    const staged = files.map(createPendingAttachment);
    setPending((previous) => [...previous, ...staged]);
    setUploading(true);
    try {
      const [dimensions, { attachments }] = await Promise.all([
        Promise.all(files.map(readImageSize)),
        api.uploadFiles(files),
      ]);
      const uploaded = new Map(staged.map((attachment, index) => [
        attachment.tempId,
        {
          ...(attachments[index] || {}),
          width: dimensions[index]?.width,
          height: dimensions[index]?.height,
          previewUrl: attachment.previewUrl,
          tempId: attachment.tempId,
        },
      ]));
      setPending((previous) => previous.map((attachment) => uploaded.get(attachment.tempId) || attachment));
    } catch (error) {
      staged.forEach(revokePreview);
      const failedIds = new Set(staged.map(({ tempId }) => tempId));
      setPending((previous) => previous.filter(({ tempId }) => !failedIds.has(tempId)));
      onErrorRef.current?.(error.message);
    } finally {
      setUploading(false);
    }
  }, []);

  useEffect(() => {
    if (!captureScreenDrops) {
      dragDepthRef.current = 0;
      setDraggingFiles(false);
      return undefined;
    }

    const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const clearDrag = () => {
      dragDepthRef.current = 0;
      setDraggingFiles(false);
    };
    const onDragEnter = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDraggingFiles(true);
    };
    const onDragOver = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (event) => {
      if (!hasFiles(event) || dragDepthRef.current === 0) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDraggingFiles(false);
    };
    const onDrop = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files || []);
      clearDrag();
      stageFiles(files);
    };

    window.addEventListener("dragenter", onDragEnter, true);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragleave", onDragLeave, true);
    window.addEventListener("drop", onDrop, true);
    window.addEventListener("dragend", clearDrag, true);
    return () => {
      dragDepthRef.current = 0;
      window.removeEventListener("dragenter", onDragEnter, true);
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("drop", onDrop, true);
      window.removeEventListener("dragend", clearDrag, true);
    };
  }, [captureScreenDrops, stageFiles]);

  const onPickFiles = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    stageFiles(files);
  }, [stageFiles]);

  const removePending = useCallback((key) => {
    setPending((previous) => {
      revokePreview(previous.find((attachment) => attachment.key === key));
      return previous.filter((attachment) => attachment.key !== key);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setPending((previous) => {
      previous.forEach(revokePreview);
      return [];
    });
  }, []);

  const replacePending = useCallback((attachments = []) => {
    setPending((previous) => {
      previous.forEach(revokePreview);
      return attachments.map((attachment) => ({
        ...attachment,
        tempId: attachment.tempId || attachment.key,
      }));
    });
  }, []);

  return {
    pending,
    uploading,
    draggingFiles,
    fileInputRef,
    stageFiles,
    onPickFiles,
    removePending,
    clearAttachments,
    replacePending,
  };
}
