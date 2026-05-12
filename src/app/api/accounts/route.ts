import { NextResponse } from "next/server";
import { z } from "zod";
import { canManagePlatform } from "@/lib/auth-access";
import { getStore } from "@/lib/storage";
import { requireRouteViewer } from "@/lib/route-auth";

const createAccountSchema = z.object({
  name: z.string().min(2),
  subscriptionStatus: z
    .enum(["trialing", "active", "past_due", "paused", "canceled"])
    .default("trialing"),
  serviceTier: z.string().min(2).default("starter"),
  billingCycleAnchor: z.string().datetime().nullable().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  primaryUserEmail: z.string().email().nullable().optional(),
});

export async function GET() {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  if (!canManagePlatform(viewer)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const store = await getStore();
  const accounts = await store.listAccounts();
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  if (!canManagePlatform(viewer)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = createAccountSchema.parse(await request.json());
    const store = await getStore();
    const account = await store.createAccount({
      name: body.name,
      subscriptionStatus: body.subscriptionStatus,
      serviceTier: body.serviceTier,
      billingCycleAnchor: body.billingCycleAnchor ?? null,
      trialEndsAt: body.trialEndsAt ?? null,
    });

    let invitation = null;
    if (body.primaryUserEmail) {
      invitation = await store.inviteAccountUser({
        accountId: account.id,
        invitedEmail: body.primaryUserEmail,
        role: "account_user",
        invitedByUserId: viewer.userId,
      });
    }

    return NextResponse.json({ account, invitation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create account." },
      { status: 400 },
    );
  }
}
