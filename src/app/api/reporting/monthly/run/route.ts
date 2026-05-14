import { NextResponse } from "next/server";
import { runMonthlyReportScheduler } from "@/lib/audit-engine";
import { requireRouteViewer } from "@/lib/route-auth";

export async function POST() {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const result = await runMonthlyReportScheduler(viewer);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run monthly report scheduler.",
      },
      { status: 400 },
    );
  }
}
