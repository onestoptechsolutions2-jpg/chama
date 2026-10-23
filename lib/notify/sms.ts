import "server-only";
import { withTenant } from "@/lib/db/rls";
import { smsMessages } from "@/lib/db/schema";

/**
 * SMS through Africa's Talking (the usual Kenyan gateway). Optional: with
 * no AT_API_KEY / AT_USERNAME set, messages are logged as "skipped" and the
 * caller falls back to showing a share link — nothing breaks.
 *
 * Env: AT_USERNAME, AT_API_KEY, optional AT_SENDER_ID (an approved
 * alphanumeric sender), AT_ENV=sandbox for the sandbox endpoint.
 *
 * Every attempt is written to sms_messages (per group) for support and for
 * counting the plan's monthly SMS allowance.
 */
export function smsEnabled(): boolean {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
}

function endpoint(): string {
  return process.env.AT_ENV === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

/** Sends one SMS to a canonical phone ("2547…"). Returns true when the gateway accepted it. Never throws. */
export async function sendSms(groupId: number, phone: string, message: string): Promise<boolean> {
  let status = "skipped";
  let providerMessageId: string | null = null;
  let error: string | null = null;

  if (smsEnabled()) {
    try {
      const body = new URLSearchParams({ username: process.env.AT_USERNAME!, to: `+${phone}`, message });
      if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);
      const res = await fetch(endpoint(), {
        method: "POST",
        headers: {
          apiKey: process.env.AT_API_KEY!,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        SMSMessageData?: { Recipients?: { status?: string; messageId?: string }[]; Message?: string };
      } | null;
      const recipient = json?.SMSMessageData?.Recipients?.[0];
      if (res.ok && recipient?.status === "Success") {
        status = "sent";
        providerMessageId = recipient.messageId ?? null;
      } else {
        status = "failed";
        error = recipient?.status ?? json?.SMSMessageData?.Message ?? `HTTP ${res.status}`;
      }
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : "Network error";
    }
  }

  try {
    await withTenant(groupId, (tx) =>
      tx.insert(smsMessages).values({ groupId, toPhone: phone, body: message, status, providerMessageId, error }),
    );
  } catch {
    // Logging must never block the action that sent the message.
  }
  return status === "sent";
}
