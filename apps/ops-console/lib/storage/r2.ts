import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
} from "@aws-sdk/client-s3";

// Cloudflare R2 (S3-compatible) storage for photos/signatures. Server-side only.
const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET;

export function r2Configured(): boolean {
  return !!(accountId && bucket && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

function client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // R2 historically rejects the SDK's default flexible checksums.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export async function putObject(key: string, body: Uint8Array | Buffer | string, contentType?: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObjectText(key: string): Promise<string> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return await res.Body!.transformToString();
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function publicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/${encodeURI(key)}` : null;
}
