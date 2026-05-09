import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const legacySecretFile = path.join(process.cwd(), "data", "runtime-secret.txt");
const secretDir = path.join(os.homedir(), ".audit-platform");
const secretFile = path.join(secretDir, "runtime-secret.txt");

let cachedSecret: Promise<string> | null = null;

async function readOrCreateSecret() {
  if (process.env.AUDIT_PLATFORM_SECRET) {
    return process.env.AUDIT_PLATFORM_SECRET;
  }

  await mkdir(secretDir, { recursive: true });

  try {
    const existing = await readFile(secretFile, "utf-8");
    if (existing.trim().length > 0) {
      return existing.trim();
    }
  } catch {
    // Check legacy location below.
  }

  try {
    const legacy = await readFile(legacySecretFile, "utf-8");
    if (legacy.trim().length > 0) {
      await writeFile(secretFile, `${legacy.trim()}\n`, { encoding: "utf-8", mode: 0o600 });
      return legacy.trim();
    }
  } catch {
    // Create below when missing.
  }

  const created = crypto.randomBytes(32).toString("base64url");
  await writeFile(secretFile, `${created}\n`, { encoding: "utf-8", mode: 0o600 });
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
