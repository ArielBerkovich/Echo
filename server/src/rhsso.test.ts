import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { User } from "./models/User.js";
import { rhssoUsername } from "./lib/rhssoUsers.js";
import { config } from "./config.js";
import {
  beginRhssoLogin,
  cookieValue,
  finishRhssoLogin,
  rhssoCookie,
} from "./rhsso.js";

describe("RHSSO OpenID Connect flow", () => {
  const originalRhsso = { ...config.rhsso };
  const originalClientOrigin = config.clientOrigin;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  const publicIssuer = "https://rhsso.example.test/realms/echo";
  let server;
  let backchannelUrl;
  let expectedNonce;
  let tokenRequest;
  let subject = "rhsso-subject-1";
  let username = "jane.doe";

  before(async () => {
    server = http.createServer(async (req, res) => {
      if (req.url === "/realms/echo/.well-known/openid-configuration") {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({
          issuer: publicIssuer,
          authorization_endpoint: "https://rhsso.example.test/realms/echo/protocol/openid-connect/auth",
          token_endpoint: "https://rhsso.example.test/realms/echo/protocol/openid-connect/token",
          jwks_uri: "https://rhsso.example.test/realms/echo/protocol/openid-connect/certs",
        }));
      }
      if (req.url === "/realms/echo/protocol/openid-connect/certs") {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ keys: [{ ...publicJwk, kid: "test-key", use: "sig", alg: "RS256" }] }));
      }
      if (req.url === "/realms/echo/protocol/openid-connect/token" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        tokenRequest = new URLSearchParams(body);
        const idToken = jwt.sign(
          {
            nonce: expectedNonce,
            preferred_username: username,
            profile: { display: "Jane Doe" },
          },
          privateKey,
          {
            algorithm: "RS256",
            keyid: "test-key",
            issuer: publicIssuer,
            audience: "echo-client",
            subject,
            expiresIn: "5m",
          }
        );
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ id_token: idToken, access_token: "unused" }));
      }
      res.statusCode = 404;
      return res.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    backchannelUrl = `http://127.0.0.1:${server.address().port}`;
    Object.assign(config.rhsso, {
      enabled: true,
      url: "https://rhsso.example.test",
      backchannelUrl,
      realm: "echo",
      clientId: "echo-client",
      clientSecret: "",
      usernameClaim: "preferred_username",
      displayNameClaim: "profile.display",
      redirectUri: "",
      allowedClientOrigins: ["https://echo.example.test", "http://localhost:8090"],
    });
    config.clientOrigin = "https://echo.example.test";
  });

  after(async () => {
    Object.assign(config.rhsso, originalRhsso);
    config.clientOrigin = originalClientOrigin;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("uses PKCE and validates the signed ID token and configured claims", async () => {
    const { authorizationUrl, flowToken } = await beginRhssoLogin();
    const authorization = new URL(authorizationUrl);
    const flow = jwt.verify(flowToken, config.jwtSecret);
    expectedNonce = flow.nonce;

    assert.equal(authorization.origin, "https://rhsso.example.test");
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.equal(authorization.searchParams.get("scope"), "openid profile");
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorization.searchParams.get("nonce"), flow.nonce);
    assert.equal(authorization.searchParams.get("state"), flow.state);
    assert.equal(
      authorization.searchParams.get("code_challenge"),
      crypto.createHash("sha256").update(flow.verifier).digest("base64url")
    );

    const identity = await finishRhssoLogin({ code: "authorization-code", state: flow.state, flowToken });
    assert.deepEqual(identity, {
      issuer: publicIssuer,
      subject: "rhsso-subject-1",
      username: "jane.doe",
      displayName: "Jane Doe",
    });
    assert.equal(tokenRequest.get("grant_type"), "authorization_code");
    assert.equal(tokenRequest.get("client_id"), "echo-client");
    assert.equal(tokenRequest.get("code"), "authorization-code");
    assert.equal(tokenRequest.get("code_verifier"), flow.verifier);
    assert.equal(tokenRequest.get("redirect_uri"), "https://echo.example.test/api/auth/rhsso/callback");
  });

  it("rejects a callback whose state does not match the signed flow", async () => {
    const { flowToken } = await beginRhssoLogin();
    await assert.rejects(
      finishRhssoLogin({ code: "authorization-code", state: "wrong-state", flowToken }),
      /Invalid RHSSO login callback/
    );
  });

  it("logs a recreated RHSSO user into the same Echo account by username", async (t) => {
    const user = { _id: "existing-echo-user", username: "jane.doe", rhssoSubject: "old-id", tokenVersion: 0 };
    const queries = [];
    t.mock.method(User, "findOne", async (query) => {
      queries.push(query);
      return query.username === user.username ? user : null;
    });
    const app = express();
    app.use("/api/auth", authRouter);
    const callbackServer = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => callbackServer.listening ? resolve() : callbackServer.once("listening", resolve));
    try {
      for (const id of ["old-id", "recreated-id"]) {
        subject = id;
        const { flowToken } = await beginRhssoLogin();
        const flow = jwt.verify(flowToken, config.jwtSecret);
        expectedNonce = flow.nonce;
        const response = await fetch(`http://127.0.0.1:${callbackServer.address().port}/api/auth/rhsso/callback?code=test&state=${flow.state}`, {
          headers: { Cookie: `echo_rhsso_flow=${flowToken}` },
          redirect: "manual",
        });
        assert.equal(response.status, 302);
        const fragment = new URLSearchParams(new URL(response.headers.get("location")).hash.slice(1));
        assert.equal(fragment.get("rhsso_error"), null);
        assert.equal(jwt.verify(fragment.get("rhsso_token"), config.jwtSecret).sub, user._id);
      }
      assert.equal(queries.length, 2);
      for (const query of queries) {
        assert.equal(query.username, "jane.doe");
        assert.equal(query.rhssoSubject, undefined);
        assert.equal(query.rhssoIssuer, undefined);
      }
    } finally {
      subject = "rhsso-subject-1";
      await new Promise((resolve) => callbackServer.close(resolve));
    }
  });

  it("rejects a missing username instead of using the subject as a username", async () => {
    const { flowToken } = await beginRhssoLogin();
    const flow = jwt.verify(flowToken, config.jwtSecret);
    expectedNonce = flow.nonce;
    username = undefined;
    try {
      await assert.rejects(finishRhssoLogin({ code: "test", state: flow.state, flowToken }), /must provide a username/);
    } finally {
      username = "jane.doe";
    }
  });

  it("normalizes case and rejects usernames that would need lossy rewriting", () => {
    assert.equal(rhssoUsername(" My_User "), "my_user");
    assert.throws(() => rhssoUsername("my user"), /must provide a username/);
    assert.throws(() => rhssoUsername(""), /must provide a username/);
  });

  it("signs and reuses an allowed LAN callback origin", async () => {
    const { authorizationUrl, flowToken } = await beginRhssoLogin({
      clientOrigin: "http://localhost:8090",
    });
    const authorization = new URL(authorizationUrl);
    const flow = jwt.verify(flowToken, config.jwtSecret);
    assert.equal(
      authorization.searchParams.get("redirect_uri"),
      "http://localhost:8090/api/auth/rhsso/callback"
    );
    assert.equal(flow.clientOrigin, "http://localhost:8090");
    assert.equal(flow.redirectUri, "http://localhost:8090/api/auth/rhsso/callback");

    await assert.rejects(
      beginRhssoLogin({ clientOrigin: "https://attacker.example" }),
      /not allowed/
    );
  });

  it("binds a migration flow to its purpose and intent", async () => {
    const { authorizationUrl, flowToken } = await beginRhssoLogin({
      kind: "rhsso-migration",
      intentId: "intent-123",
    });
    const authorization = new URL(authorizationUrl);
    const flow = jwt.verify(flowToken, config.jwtSecret);
    expectedNonce = flow.nonce;

    const identity = await finishRhssoLogin({
      code: "authorization-code",
      state: authorization.searchParams.get("state"),
      flowToken,
      expectedKind: "rhsso-migration",
    });
    assert.equal(identity.intentId, "intent-123");

    await assert.rejects(
      finishRhssoLogin({
        code: "authorization-code",
        state: authorization.searchParams.get("state"),
        flowToken,
      }),
      /Invalid RHSSO login callback/
    );
  });

  it("stores the flow in an HTTP-only secure callback cookie", async () => {
    const { flowToken } = await beginRhssoLogin();
    const cookie = rhssoCookie(flowToken);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /; Secure/);
    assert.equal(cookieValue(cookie, "echo_rhsso_flow"), flowToken);
  });
});
