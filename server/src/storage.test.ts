import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { after, before, describe, it } from "node:test";

describe("storage lifecycle configuration", () => {
  const originalEnv = { ...process.env };
  let server;
  let lifecycleRequest;
  let ensureBucket;

  before(async () => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "HEAD" && url.pathname === "/echo-test/") {
        res.statusCode = 200;
        return res.end();
      }

      if (
        req.method === "PUT" &&
        url.pathname === "/echo-test/" &&
        url.searchParams.has("lifecycle")
      ) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        lifecycleRequest = {
          headers: req.headers,
          body: Buffer.concat(chunks),
        };
        res.statusCode = 200;
        return res.end();
      }

      res.statusCode = 404;
      return res.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    process.env.S3_ENDPOINT = `http://127.0.0.1:${server.address().port}`;
    process.env.S3_ACCESS_KEY = "test-access-key";
    process.env.S3_SECRET_KEY = "test-secret-key";
    process.env.S3_BUCKET = "echo-test";
    process.env.S3_REGION = "us-east-1";

    ({ ensureBucket } = await import(`./storage.js?test=${Date.now()}`));
  });

  after(async () => {
    process.env = originalEnv;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it("sends the lifecycle XML with a valid Content-MD5 header", async () => {
    await ensureBucket();

    assert.ok(lifecycleRequest, "expected a lifecycle configuration request");
    const expectedMd5 = crypto.createHash("md5").update(lifecycleRequest.body).digest("base64");
    assert.equal(lifecycleRequest.headers["content-md5"], expectedMd5);
    assert.equal(lifecycleRequest.headers["x-amz-sdk-checksum-algorithm"], "MD5");
  });
});
