import path from "node:path";

export function getAuditDataDir() {
  const configuredDataDir = process.env.AUDIT_DATA_DIR?.trim();
  if (configuredDataDir) {
    return path.resolve(configuredDataDir);
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function getAuditDataFile(...segments: string[]) {
  return path.join(getAuditDataDir(), ...segments);
}
