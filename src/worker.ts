import { startAuditWorker } from "@/lib/audit-engine";

async function main() {
  const boss = await startAuditWorker();
  process.stdout.write("Audit worker is running.\n");

  const shutdown = async () => {
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
