import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
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
            preferred_username: "jane.doe",
            profile: { display: "Jane Doe" },
          },
          privateKey,
          {
            algorithm: "RS256",
            keyid: "test-key",
            issuer: publicIssuer,
            audience: "echo-client",
            subject: "rhsso-subject-1",
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

  it("stores the flow in an HTTP-only secure callback cookie", async () => {
    const { flowToken } = await beginRhssoLogin();
    const cookie = rhssoCookie(flowToken);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /; Secure/);
    assert.equal(cookieValue(cookie, "echo_rhsso_flow"), flowToken);
  });
});
