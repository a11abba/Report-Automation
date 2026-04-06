import { AppProviders } from "@/components/app-providers";
import { DashboardShell } from "@/components/dashboard-shell";
import { listDashboardData } from "@/lib/audit-engine";

export default async function Home() {
  const data = await listDashboardData();
  return (
    <AppProviders>
      <DashboardShell initialData={data} />
    </AppProviders>
  );
}
