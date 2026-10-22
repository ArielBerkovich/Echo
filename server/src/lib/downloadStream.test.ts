import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";
import { test } from "node:test";
import { streamDownload } from "./downloadStream.js";

test("streamDownload reports source failures and closes the response", async () => {
  const source = new PassThrough();
  const response = new PassThrough();
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(chunk));
  const failed = new Promise<Error>((resolve) => streamDownload(source, response, resolve));

  source.write("partial");
  source.destroy(new Error("storage unavailable"));

  const error = await failed;
  assert.equal(error.message, "storage unavailable");
  assert.equal(Buffer.concat(chunks).toString(), "partial");
  assert.equal(response.destroyed, true);
});

test("streamDownload destroys the source when the client disconnects", async () => {
  let sourceDestroyed = false;
  const source = new Readable({
    read() {},
    destroy(error, callback) {
      sourceDestroyed = true;
      callback(error);
    },
  });
  const response = new PassThrough();
  const finished = new Promise<void>((resolve) => response.on("close", resolve));
  streamDownload(source, response, () => {});

  response.destroy();
  await finished;
  assert.equal(sourceDestroyed, true);
});
