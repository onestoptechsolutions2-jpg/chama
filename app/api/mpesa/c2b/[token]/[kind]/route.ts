import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { parseMpesaTime } from "@/lib/domain/payment-matching";
import { systemActor } from "@/lib/commands/actor";
import { runCommand } from "@/lib/commands/run";
import { receivePayment } from "@/lib/commands/payments";

/**
 * Safaricom Daraja C2B for the group's OWN paybill/till: register
 *   ValidationURL   = <PORTAL_BASE_URL>/api/mpesa/c2b/<token>/validation
 *   ConfirmationURL = <PORTAL_BASE_URL>/api/mpesa/c2b/<token>/confirmation
 * (shown on the group's Payments page). The money goes to the group's own
 * account — the platform only reads the notification and records it.
 *
 * Daraja doesn't sign callbacks, so the unguessable per-group token in the
 * path is the credential; it can be rotated from the Payments page. Always
 * answers ResultCode 0: a payment that can't be matched still waits in the
 * inbox, and refusing would make Safaricom reverse the member's payment.
 */
type C2BBody = {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
};

const ACCEPT = { ResultCode: 0, ResultDesc: "Accepted" };

export async function POST(req: Request, { params }: { params: Promise<{ token: string; kind: string }> }) {
  const { token, kind } = await params;
  if (kind !== "confirmation" && kind !== "validation") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const group = await withPlatformAdmin((tx) =>
    tx.query.groups.findFirst({ where: eq(groups.c2bToken, token), columns: { id: true } }),
  );
  if (!group) return NextResponse.json({ ResultCode: "C2B00012", ResultDesc: "Rejected" }, { status: 404 });

  // Validation: accept everything (matching happens on confirmation).
  if (kind === "validation") return NextResponse.json(ACCEPT);

  const body = (await req.json().catch(() => null)) as C2BBody | null;
  if (!body?.TransID || !body.TransAmount) return NextResponse.json(ACCEPT);

  const actor = await systemActor(group.id, "mpesa", "M-Pesa");
  if (!actor) return NextResponse.json(ACCEPT);
  const name = [body.FirstName, body.MiddleName, body.LastName].filter(Boolean).join(" ") || null;
  const result = await runCommand(actor, receivePayment, {
    source: "mpesa",
    externalId: body.TransID,
    amount: body.TransAmount,
    payerPhone: body.MSISDN ?? null,
    payerName: name,
    accountRef: body.BillRefNumber ?? null,
    receivedAt: parseMpesaTime(body.TransTime),
    raw: body,
  });
  if (!result.ok) console.error(`[mpesa c2b] group ${group.id} ${body.TransID}: ${result.error}`);
  return NextResponse.json(ACCEPT);
}
