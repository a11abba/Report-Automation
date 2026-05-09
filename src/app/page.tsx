import { AppProviders } from "@/components/app-providers";
import { DashboardShell } from "@/components/dashboard-shell";
import { listDashboardData } from "@/lib/audit-engine";
import { redirectIfUnauthenticated } from "@/lib/auth-session-server";

export default async function Home() {
  const viewer = await redirectIfUnauthenticated();
  const data = await listDashboardData();
  return (
    <AppProviders>
      <DashboardShell initialData={data} viewer={viewer} />
    </AppProviders>
  );
}
