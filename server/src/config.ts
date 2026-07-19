function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Environment variable ${name} is required but not set`);
  return val;
}

// Central configuration, sourced from environment with sensible local defaults.
export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri:
    process.env.MONGO_URI ||
    (process.env.MONGO_HOST && process.env.MONGO_USER && process.env.MONGO_PASSWORD
      ? `mongodb://${encodeURIComponent(process.env.MONGO_USER)}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST}/echo?authSource=admin&replicaSet=${encodeURIComponent(process.env.MONGO_REPLICA_SET || "rs0")}`
      : "mongodb://localhost:27017/echo"),
  jwtSecret: required("JWT_SECRET"),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:8080",
  rhsso: {
    enabled: process.env.RHSSO_ENABLED === "true",
    url: String(process.env.RHSSO_URL || "").replace(/\/+$/, ""),
    backchannelUrl: String(process.env.RHSSO_BACKCHANNEL_URL || "").replace(/\/+$/, ""),
    realm: process.env.RHSSO_REALM || "",
    clientId: process.env.RHSSO_CLIENT_ID || "",
    clientSecret: process.env.RHSSO_CLIENT_SECRET || "",
    usernameClaim: process.env.RHSSO_USERNAME_CLAIM || "preferred_username",
    displayNameClaim: process.env.RHSSO_DISPLAY_NAME_CLAIM || "name",
    redirectUri: process.env.RHSSO_REDIRECT_URI || "",
  },
  // How many messages to return per history page.
  messagePageSize: 50,
  // S3-compatible object storage (MinIO locally) for file uploads.
  s3: {
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    accessKey: process.env.S3_ACCESS_KEY || "echo",
    secretKey: process.env.S3_SECRET_KEY || "echo-dev-secret",
    bucket: process.env.S3_BUCKET || "echo-uploads",
    region: process.env.S3_REGION || "us-east-1",
  },
  // Per-file upload ceiling (bytes) and max files per message.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024,
  maxFilesPerMessage: 10,
  // Shared file attachments are auto-expired after this many days. Profile
  // pictures and custom emoji are tagged separately and never expire.
  fileTtlDays: Number(process.env.FILE_TTL_DAYS) || 180,
};
