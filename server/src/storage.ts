import { randomUUID } from "crypto";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectTaggingCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { config } from "./config.js";

// Every stored object is tagged with a category. A tag-filtered lifecycle rule
// expires only "attachment" objects; "avatar" and "emoji" objects never expire.
export const FILE_CATEGORY = { ATTACHMENT: "attachment", AVATAR: "avatar", EMOJI: "emoji" };

// One client, pointed at MinIO (or any S3-compatible endpoint). Path-style
// addressing is required for MinIO (no virtual-host buckets).
const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
});

const BUCKET = config.s3.bucket;

// Create the uploads bucket on boot if it isn't there yet (idempotent), then
// (re)apply the lifecycle rule so shared attachments auto-expire.
export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Created object-storage bucket "${BUCKET}"`);
  }
  await ensureLifecycleRules();
}

// Expire only objects tagged category=attachment after the configured TTL.
// Avatars and emojis carry different tags, so they're never matched/deleted.
async function ensureLifecycleRules() {
  try {
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: BUCKET,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "expire-attachments",
              Status: "Enabled",
              Filter: { Tag: { Key: "category", Value: FILE_CATEGORY.ATTACHMENT } },
              Expiration: { Days: config.fileTtlDays },
            },
          ],
        },
      })
    );
    console.log(`Lifecycle: attachments expire after ${config.fileTtlDays} days`);
  } catch (err) {
    // Non-fatal: storage still works, files just won't auto-expire.
    console.warn("Could not set storage lifecycle rule:", err.message);
  }
}

// Map a few content types to friendlier extensions for the stored key.
function extensionFor(name, contentType) {
  const fromName = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  if (fromName) return fromName.toLowerCase();
  return (contentType.split("/")[1] || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Store a buffer under an unguessable key; returns the key. `category` controls
// expiry: "attachment" (default) is subject to the TTL; "avatar"/"emoji" aren't.
export async function putObject({ buffer, name, contentType, category = FILE_CATEGORY.ATTACHMENT }) {
  const key = `${randomUUID()}.${extensionFor(name, contentType)}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      Tagging: `category=${category}`,
    })
  );
  return key;
}

// Re-tag an existing object's category (e.g. when a generic upload becomes a
// profile picture, exempting it from the attachment TTL). Best-effort.
export async function setFileCategory(key, category) {
  if (!key) return;
  try {
    await s3.send(
      new PutObjectTaggingCommand({
        Bucket: BUCKET,
        Key: key,
        Tagging: { TagSet: [{ Key: "category", Value: category }] },
      })
    );
  } catch (err) {
    console.warn(`Could not re-tag ${key} as ${category}:`, err.message);
  }
}

// Fetch an object for streaming back to the client. Returns the AWS response
// (Body is a Node Readable stream) or null if the key doesn't exist.
export async function getObject(key) {
  try {
    return await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") return null;
    throw err;
  }
}
