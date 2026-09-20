import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectChromiumBrowser } from "./browserCompatibility.js";

describe("Chromium browser detection", () => {
  it("identifies Chrome and its major version", () => {
    assert.deepEqual(
      detectChromiumBrowser("Mozilla/5.0 Chrome/91.0.4472.114 Safari/537.36"),
      { name: "Chrome", major: 91 },
    );
  });

  it("uses the Edge token instead of the embedded Chrome token", () => {
    assert.deepEqual(
      detectChromiumBrowser("Mozilla/5.0 Chrome/110.0.0.0 Safari/537.36 Edg/110.0.1587.57"),
      { name: "Microsoft Edge", major: 110 },
    );
  });

  it("recognizes other Chromium browsers", () => {
    assert.deepEqual(detectChromiumBrowser("Mozilla/5.0 Chrome/108.0.0.0 OPR/94.0.0.0"), { name: "Opera", major: 108 });
    assert.deepEqual(detectChromiumBrowser("Mozilla/5.0 Chrome/109.0.0.0 SamsungBrowser/20.0"), { name: "Samsung Internet for Android", major: 109 });
    assert.deepEqual(detectChromiumBrowser("Mozilla/5.0 Chrome/110.0.0.0 Vivaldi/5.6"), { name: "Vivaldi", major: 110 });
  });

  it("does not classify Firefox or iOS Chrome as Chromium", () => {
    assert.equal(detectChromiumBrowser("Mozilla/5.0 Firefox/120.0"), null);
    assert.equal(detectChromiumBrowser("Mozilla/5.0 CriOS/110.0.0.0 Mobile Safari/604.1"), null);
  });
});
