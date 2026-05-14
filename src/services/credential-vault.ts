import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import type {
  CredentialSecretPayload,
  IntegrationCredentials,
} from "@/lib/audit/types";
import { getAuditDataFile } from "@/lib/runtime-paths";
import { getStore } from "@/lib/storage";
import { getEncryptionKey } from "./app-secret";

interface VaultShape {
  secrets: Record<string, string>;
}

async function readVault() {
  try {
    const raw = await readFile(getAuditDataFile("credential-vault.json"), "utf-8");
    const parsed = JSON.parse(raw) as Partial<VaultShape>;
    return {
      secrets: parsed.secrets ?? {},
    };
  } catch {
    return { secrets: {} };
  }
}

function pickSecretPayload(credentials: IntegrationCredentials): CredentialSecretPayload | null {
  const payload: CredentialSecretPayload = {};
  if (credentials.apiKey) payload.apiKey = credentials.apiKey;
  if (credentials.accessToken) payload.accessToken = credentials.accessToken;
  if (credentials.refreshToken) payload.refreshToken = credentials.refreshToken;
  return Object.keys(payload).length > 0 ? payload : null;
}

function encryptPayload(payload: CredentialSecretPayload, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: encrypted.toString("base64url"),
  });
}

function decryptPayload(serialized: string, key: Buffer): CredentialSecretPayload {
  const parsed = JSON.parse(serialized) as {
    iv: string;
    tag: string;
    ciphertext: string;
  };
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf-8")) as CredentialSecretPayload;
}

function randomSecretRef() {
  return `secret_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function storeCredentialSecret(
  credentials: IntegrationCredentials,
  existingSecretRef?: string,
) {
  const payload = pickSecretPayload(credentials);
  const sanitized: IntegrationCredentials = {
    ...credentials,
    apiKey: undefined,
    accessToken: undefined,
    refreshToken: undefined,
  };

  if (!payload) {
    return sanitized;
  }

  const key = await getEncryptionKey();
  const secretRef = existingSecretRef ?? credentials.secretRef ?? randomSecretRef();
  const store = await getStore();
  await store.storeSecret(secretRef, encryptPayload(payload, key));
  sanitized.secretRef = secretRef;
  return sanitized;
}

export async function hydrateCredentialSecret(credentials: IntegrationCredentials) {
  if (!credentials.secretRef) {
    return credentials;
  }

  const store = await getStore();
  let encrypted = await store.readSecret(credentials.secretRef);
  if (!encrypted) {
    const vault = await readVault();
    encrypted = vault.secrets[credentials.secretRef] ?? null;
    if (encrypted) {
      await store.storeSecret(credentials.secretRef, encrypted);
    }
  }
  if (!encrypted) {
    return credentials;
  }

  const key = await getEncryptionKey();
  const payload = decryptPayload(encrypted, key);
  return {
    ...credentials,
    ...payload,
  };
}

export async function removeCredentialSecret(secretRef: string | undefined | null) {
  if (!secretRef) {
    return;
  }
  const store = await getStore();
  await store.deleteSecret(secretRef);
}
