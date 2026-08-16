import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import express from "express";

import { desktopDownloadsRouter, desktopUpdatesRouter } from "./desktopUpdates.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function withServer(updateDir: string, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use("/api/desktop-updates", desktopUpdatesRouter(updateDir));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

describe("desktopUpdatesRouter", () => {
  it("returns a clear 404 when update hosting is disabled", async () => {
    await withServer("", async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/desktop-updates/windows/latest.yml`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Desktop updates are not configured" });
    });
  });

  it("serves manifests without caching and versioned artifacts immutably", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-updates-"));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, "windows"));
    fs.writeFileSync(path.join(directory, "windows", "latest.yml"), "version: 0.3.0\n");
    fs.writeFileSync(path.join(directory, "windows", "Echo-0.3.0.exe"), "installer");

    await withServer(directory, async (baseUrl) => {
      const manifest = await fetch(`${baseUrl}/api/desktop-updates/windows/latest.yml`);
      assert.equal(manifest.status, 200);
      assert.equal(await manifest.text(), "version: 0.3.0\n");
      assert.equal(manifest.headers.get("cache-control"), "no-cache");
      assert.equal(manifest.headers.get("x-content-type-options"), "nosniff");

      const artifact = await fetch(`${baseUrl}/api/desktop-updates/windows/Echo-0.3.0.exe`);
      assert.equal(artifact.status, 200);
      assert.equal(await artifact.text(), "installer");
      assert.equal(artifact.headers.get("cache-control"), "public, max-age=31536000, immutable");
    });
  });

  it("does not serve files outside the configured directory", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-updates-"));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, "latest.yml"), "version: 0.3.0\n");

    await withServer(directory, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/desktop-updates/%2e%2e/package.json`);
      assert.equal(response.status, 404);
    });
  });
});

describe("desktopDownloadsRouter", () => {
  it("describes embedded installers from the update manifests", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-downloads-"));
    fs.mkdirSync(path.join(directory, "windows"));
    fs.mkdirSync(path.join(directory, "linux"));
    fs.writeFileSync(path.join(directory, "windows", "latest.yml"), "version: 0.3.0\nfiles:\n  - url: Echo Setup 0.3.0.exe\n");
    fs.writeFileSync(path.join(directory, "linux", "latest-linux.yml"), "version: 0.3.0\nfiles:\n  - url: Echo-0.3.0.AppImage\n");

    const app = express();
    app.use("/api/desktop-downloads", desktopDownloadsRouter(directory));
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, () => resolve(listener));
    });
    try {
      const address = server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/api/desktop-downloads`);
      assert.deepEqual(await response.json(), {
        version: "0.3.0",
        windows: { available: true, version: "0.3.0", url: "/api/desktop-updates/windows/Echo%20Setup%200.3.0.exe" },
        linux: { available: true, version: "0.3.0", url: "/api/desktop-updates/linux/Echo-0.3.0.AppImage" },
      });
    } finally {
      server.close();
    }
  });
});
