import "express-async-errors";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import http from "node:http";
import { test } from "node:test";

test("rejected async Express routes reach error middleware and the server keeps serving", async () => {
  const app = express();
  app.get("/reject", async () => {
    throw new Error("route failure");
  });
  app.get("/ok", (_req, res) => res.json({ status: "ok" }));
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: "Internal server error" });
  });

  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    const rejected = await fetch(`http://127.0.0.1:${port}/reject`);
    assert.equal(rejected.status, 500);
    assert.deepEqual(await rejected.json(), { error: "Internal server error" });

    const healthy = await fetch(`http://127.0.0.1:${port}/ok`);
    assert.equal(healthy.status, 200);
    assert.deepEqual(await healthy.json(), { status: "ok" });
  } finally {
    server.close();
    await once(server, "close");
  }
});
