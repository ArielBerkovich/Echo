const fs = require("node:fs");

const MIN_ZOOM_LEVEL = -3;
const MAX_ZOOM_LEVEL = 5;
const ZOOM_STEP = 0.5;

function clampZoomLevel(value) {
  const level = Number(value);
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, level));
}

function zoomActionForInput(input = {}) {
  if (input.type !== "keyDown" || input.alt || (!input.control && !input.meta)) return null;
  const key = String(input.key || "").toLowerCase();
  const code = String(input.code || "").toLowerCase();
  if (key === "0" || key === "numpad0" || code === "numpad0") return "reset";
  if (["+", "=", "add", "numpadadd"].includes(key) || code === "numpadadd") return "in";
  if (["-", "_", "subtract", "numpadsubtract"].includes(key) || code === "numpadsubtract") return "out";
  return null;
}

function nextZoomLevel(current, action) {
  if (action === "reset") return 0;
  if (action === "in") return clampZoomLevel(clampZoomLevel(current) + ZOOM_STEP);
  if (action === "out") return clampZoomLevel(clampZoomLevel(current) - ZOOM_STEP);
  return clampZoomLevel(current);
}

function readStoredZoomLevel(filePath) {
  try {
    return clampZoomLevel(JSON.parse(fs.readFileSync(filePath, "utf8")).zoomLevel);
  } catch {
    return 0;
  }
}

function writeStoredZoomLevel(filePath, level) {
  const clamped = clampZoomLevel(level);
  fs.writeFileSync(filePath, JSON.stringify({ zoomLevel: clamped }));
  return clamped;
}

module.exports = { MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL, clampZoomLevel, nextZoomLevel, readStoredZoomLevel, writeStoredZoomLevel, zoomActionForInput };

