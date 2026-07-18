import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  notificationPreview,
  notificationsActive,
  notifyPermission,
  notifyPref,
  notifySupported,
  requestNotifyPermission,
  setNotifyPref,
  showNotification,
  showTestNotification,
} from "./notify.js";

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe("notification preferences", () => {
  const originalWindow = globalThis.window;
  const originalNotification = globalThis.Notification;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    globalThis.localStorage = createStorage();
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.Notification = originalNotification;
    globalThis.localStorage = originalLocalStorage;
  });

  it("reports unsupported notifications outside a browser-like environment", async () => {
    delete globalThis.window;
    delete globalThis.Notification;

    assert.equal(notifySupported(), false);
    assert.equal(notifyPermission(), "denied");
    assert.equal(await requestNotifyPermission(), "denied");
    assert.equal(notificationsActive(), false);
  });

  it("stores notification preferences", () => {
    setNotifyPref(true);
    assert.equal(notifyPref(), true);
    setNotifyPref(false);
    assert.equal(notifyPref(), false);
  });

  it("cleans Markdown from notification previews", () => {
    assert.equal(notificationPreview("**Build** finished with [logs](https://example.test)"), "Build finished with logs");
  });

  it("requests permission only when permission is default", async () => {
    let requested = false;
    globalThis.window = { Notification: true };
    globalThis.Notification = {
      permission: "default",
      requestPermission: async () => {
        requested = true;
        return "granted";
      },
    };

    assert.equal(await requestNotifyPermission(), "granted");
    assert.equal(requested, true);
  });

  it("considers notifications active only with support, grant, and enabled pref", () => {
    globalThis.window = { Notification: true };
    globalThis.Notification = { permission: "granted" };

    assert.equal(notificationsActive(), false);
    setNotifyPref(true);
    assert.equal(notificationsActive(), true);
  });

  it("shows tagged notifications and wires click callbacks", () => {
    const created = [];
    let focused = false;
    let clicked = false;
    globalThis.window = {
      Notification: true,
      focus() {
        focused = true;
      },
    };
    globalThis.Notification = class {
      static permission = "granted";
      constructor(title, options) {
        this.title = title;
        this.options = options;
        this.closed = false;
        created.push(this);
      }
      close() {
        this.closed = true;
      }
    };
    setNotifyPref(true);

    showNotification("Hello", { body: "Body", tag: "dm-1", onClick: () => (clicked = true) });
    assert.equal(created.length, 1);
    assert.equal(created[0].title, "Hello");
    assert.deepEqual(created[0].options, {
      body: "Body",
      icon: "/echo-logo.png",
      tag: "dm-1",
      renotify: true,
    });

    created[0].onclick();
    assert.equal(focused, true);
    assert.equal(clicked, true);
    assert.equal(created[0].closed, true);
  });

  it("returns whether a test notification was sent", () => {
    const created = [];
    globalThis.window = { Notification: true, focus() {} };
    globalThis.Notification = class {
      static permission = "granted";
      constructor(title, options) {
        created.push({ title, options });
      }
    };

    assert.equal(showTestNotification(), false);
    setNotifyPref(true);
    assert.equal(showTestNotification(), true);
    assert.equal(created.length, 1);
    assert.match(created[0].title, /Echo notifications work/);
  });
});
