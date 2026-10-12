import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { resolvePublicUrl } from "./useAuthUrl.js";

describe("resolvePublicUrl", () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it("keeps browser-relative public URLs unchanged", () => {
    assert.equal(resolvePublicUrl("/allure-docker-icon.png"), "/allure-docker-icon.png");
  });

  it("makes public URLs relative to the packaged desktop app", () => {
    globalThis.window = { echoDesktopConfig: { backendUrl: "http://localhost:8090" } };
    assert.equal(resolvePublicUrl("/allure-docker-icon.png"), "./allure-docker-icon.png");
  });
});
