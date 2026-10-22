const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, clampZoomLevel, nextZoomLevel, readStoredZoomLevel, writeStoredZoomLevel, zoomActionForInput } = require("./zoom.cjs");

describe("desktop zoom shortcuts", () => {
  it("recognizes Ctrl/Cmd zoom keys including numpad keys", () => {
    for (const modifier of ["control", "meta"]) {
      assert.equal(zoomActionForInput({ type: "keyDown", key: "+", [modifier]: true }), "in");
      assert.equal(zoomActionForInput({ type: "keyDown", key: "=", [modifier]: true }), "in");
      assert.equal(zoomActionForInput({ type: "keyDown", key: "-", [modifier]: true }), "out");
      assert.equal(zoomActionForInput({ type: "keyDown", key: "0", [modifier]: true }), "reset");
      assert.equal(zoomActionForInput({ type: "keyDown", key: "Add", code: "NumpadAdd", [modifier]: true }), "in");
      assert.equal(zoomActionForInput({ type: "keyDown", key: "Subtract", code: "NumpadSubtract", [modifier]: true }), "out");
      assert.equal(zoomActionForInput({ type: "keyDown", key: "Numpad0", [modifier]: true }), "reset");
    }
  });

  it("ignores unrelated key events and modified shortcuts", () => {
    assert.equal(zoomActionForInput({ type: "keyUp", key: "+", control: true }), null);
    assert.equal(zoomActionForInput({ type: "keyDown", key: "+" }), null);
    assert.equal(zoomActionForInput({ type: "keyDown", key: "-", control: true, alt: true }), null);
  });

  it("steps, resets, and clamps zoom levels", () => {
    assert.equal(nextZoomLevel(0, "in"), 0.5);
    assert.equal(nextZoomLevel(0.5, "out"), 0);
    assert.equal(nextZoomLevel(4.9, "in"), MAX_ZOOM_LEVEL);
    assert.equal(nextZoomLevel(-2.9, "out"), MIN_ZOOM_LEVEL);
    assert.equal(nextZoomLevel(3, "reset"), 0);
    assert.equal(clampZoomLevel(Number.NaN), 0);
  });

  it("persists the selected level for the next app launch", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-zoom-"));
    const filePath = path.join(directory, "zoom.json");
    try {
      assert.equal(writeStoredZoomLevel(filePath, 2.5), 2.5);
      assert.equal(readStoredZoomLevel(filePath), 2.5);
      assert.equal(writeStoredZoomLevel(filePath, 99), MAX_ZOOM_LEVEL);
      assert.equal(readStoredZoomLevel(filePath), MAX_ZOOM_LEVEL);
      fs.writeFileSync(filePath, "invalid json");
      assert.equal(readStoredZoomLevel(filePath), 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
