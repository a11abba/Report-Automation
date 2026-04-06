import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const dataDir = path.join(process.cwd(), "data");
const secretFile = path.join(dataDir, "runtime-secret.txt");

let cachedSecret: Promise<string> | null = null;

async function readOrCreateSecret() {
  if (process.env.AUDIT_PLATFORM_SECRET) {
    return process.env.AUDIT_PLATFORM_SECRET;
  }

  await mkdir(dataDir, { recursive: true });

  try {
    const existing = await readFile(secretFile, "utf-8");
    if (existing.trim().length > 0) {
      return existing.trim();
    }
  } catch {
    // Create below when missing.
  }

  const created = crypto.randomBytes(32).toString("base64url");
  await writeFile(secretFile, `${created}\n`, "utf-8");
  return created;
}

export async function getAppSecret() {
  cachedSecret ??= readOrCreateSecret();
  return cachedSecret;
}

export async function createHmac(input: string) {
  const secret = await getAppSecret();
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

export async function getEncryptionKey() {
  const secret = await getAppSecret();
  return crypto.createHash("sha256").update(secret).digest();
}
