import path from "node:path";

const defaultDataDir = path.join(/* turbopackIgnore: true */ process.cwd(), "data");

export function getAuditDataDir() {
  return path.resolve(process.env.AUDIT_DATA_DIR || defaultDataDir);
}

export function getAuditDataFile(...segments: string[]) {
  return path.join(getAuditDataDir(), ...segments);
}
