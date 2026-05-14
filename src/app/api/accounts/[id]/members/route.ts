import { NextResponse } from "next/server";
import { z } from "zod";
import { canManagePlatform } from "@/lib/auth-access";
import { getStore } from "@/lib/storage";
import { requireRouteViewer } from "@/lib/route-auth";

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["account_admin", "account_operator"]).default("account_operator"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  if (!canManagePlatform(viewer)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = inviteMemberSchema.parse(await request.json());
    const store = await getStore();
    const account = await store.getAccount(id);
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const membership = await store.inviteAccountUser({
      accountId: account.id,
      invitedEmail: body.email,
      role: body.role,
      invitedByUserId: viewer.userId,
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to invite member." },
      { status: 400 },
    );
  }
}
