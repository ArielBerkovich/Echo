import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const ORIGINAL_ENV = { ...process.env };

async function loadConfig(env) {
  process.env = { ...ORIGINAL_ENV, ...env };
  for (const key of Object.keys(process.env)) {
    if (env[key] === undefined) delete process.env[key];
  }
  return import(`./config.js?test=${Date.now()}-${Math.random()}`);
}

describe("config", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("requires JWT_SECRET", async () => {
    await assert.rejects(loadConfig({ JWT_SECRET: undefined }), /JWT_SECRET is required/);
  });

  it("uses local defaults when optional environment variables are absent", async () => {
    const { config } = await loadConfig({ JWT_SECRET: "secret" });

    assert.equal(config.port, 4000);
    assert.equal(config.mongoUri, "mongodb://localhost:27017/echo");
    assert.equal(config.clientOrigin, "http://localhost:8080");
    assert.deepEqual(config.rhsso, {
      enabled: false,
      url: "",
      backchannelUrl: "",
      realm: "",
      clientId: "",
      clientSecret: "",
      usernameClaim: "preferred_username",
      displayNameClaim: "name",
      redirectUri: "",
    });
    assert.equal(config.messagePageSize, 50);
    assert.equal(config.maxUploadBytes, 10 * 1024 * 1024);
    assert.equal(config.maxFilesPerMessage, 10);
    assert.equal(config.fileTtlDays, 180);
    assert.equal(config.s3.bucket, "echo-uploads");
  });

  it("honors environment overrides", async () => {
    const { config } = await loadConfig({
      JWT_SECRET: "secret",
      PORT: "5000",
      MONGO_URI: "mongodb://db1:27017,db2:27017/echo?replicaSet=rs0",
      CLIENT_ORIGIN: "https://echo.example",
      S3_ENDPOINT: "https://s3.example",
      S3_ACCESS_KEY: "access",
      S3_SECRET_KEY: "secret-key",
      S3_BUCKET: "bucket",
      S3_REGION: "eu-west-1",
      MAX_UPLOAD_BYTES: "1234",
      FILE_TTL_DAYS: "30",
      RHSSO_ENABLED: "true",
      RHSSO_URL: "https://sso.example/auth/",
      RHSSO_BACKCHANNEL_URL: "http://rhsso:8080/auth/",
      RHSSO_REALM: "echo",
      RHSSO_CLIENT_ID: "echo-client",
      RHSSO_CLIENT_SECRET: "client-secret",
      RHSSO_USERNAME_CLAIM: "attributes.handle",
      RHSSO_DISPLAY_NAME_CLAIM: "display_name",
      RHSSO_REDIRECT_URI: "https://echo.example/api/auth/rhsso/callback",
    });

    assert.equal(config.port, 5000);
    assert.equal(config.mongoUri, "mongodb://db1:27017,db2:27017/echo?replicaSet=rs0");
    assert.equal(config.clientOrigin, "https://echo.example");
    assert.deepEqual(config.s3, {
      endpoint: "https://s3.example",
      accessKey: "access",
      secretKey: "secret-key",
      bucket: "bucket",
      region: "eu-west-1",
    });
    assert.equal(config.maxUploadBytes, 1234);
    assert.equal(config.fileTtlDays, 30);
    assert.deepEqual(config.rhsso, {
      enabled: true,
      url: "https://sso.example/auth",
      backchannelUrl: "http://rhsso:8080/auth",
      realm: "echo",
      clientId: "echo-client",
      clientSecret: "client-secret",
      usernameClaim: "attributes.handle",
      displayNameClaim: "display_name",
      redirectUri: "https://echo.example/api/auth/rhsso/callback",
    });
  });
});
