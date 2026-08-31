import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import { withTenant, type Tx } from "@/lib/db/rls";
import { webhookEndpoints, webhookDeliveries } from "@/lib/db/schema";

export type WebhookEventType =
  | "contribution.recorded"
  | "loan.approved"
  | "loan.rejected"
  | "member.joined"
  | "mgr.slot.paid";

const DELIVERY_TIMEOUT_MS = 8000;

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Fires a webhook event to every active endpoint a group has subscribed to
 * it. Deliberately single-attempt, no retry queue — this app is fully
 * serverless with no background job runner, so a real retry-with-backoff
 * system is out of scope for now (flagged in docs/CHANGELOG.md's Known
 * gaps). Every attempt is logged to webhook_deliveries regardless of
 * outcome, same "log it before/regardless of success" convention
 * payment_webhook_events already uses for inbound webhooks — so a failed
 * delivery is at least visible, not silent.
 *
 * Always called fire-and-forget from within the caller's own withTenant
 * transaction having already committed its real work — a webhook
 * subscriber being slow or down must never block or fail the actual
 * action (approving a loan, recording a contribution). Callers should
 * `void dispatchWebhookEvent(...)` rather than `await` it inline with the
 * rest of their transaction.
 */
export async function dispatchWebhookEvent(
  groupId: number,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await withTenant(groupId, (tx) =>
      tx.query.webhookEndpoints.findMany({
        where: and(eq(webhookEndpoints.groupId, groupId), eq(webhookEndpoints.active, true)),
      }),
    );
    const subscribed = endpoints.filter((e) => e.events.includes(eventType));
    if (subscribed.length === 0) return;

    const payload = {
      event: eventType,
      groupId,
      occurredAt: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    await Promise.all(subscribed.map((endpoint) => deliverOne(groupId, endpoint, eventType, payload, body)));
  } catch {
    // Never let a webhook-dispatch failure surface as a failure of the
    // action that triggered it — the real work already committed.
  }
}

async function deliverOne(
  groupId: number,
  endpoint: { id: number; url: string; secret: string },
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  body: string,
): Promise<void> {
  const signature = signPayload(endpoint.secret, body);
  let success = false;
  let responseStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chama-Event": eventType,
        "X-Chama-Signature": signature,
      },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    responseStatus = res.status;
    success = res.ok;
    if (!success) errorMessage = `Endpoint responded ${res.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Delivery failed";
  }

  await recordDelivery(groupId, endpoint.id, eventType, payload, success, responseStatus, errorMessage);
}

async function recordDelivery(
  groupId: number,
  webhookEndpointId: number,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  success: boolean,
  responseStatus: number | null,
  errorMessage: string | null,
): Promise<void> {
  await withTenant(groupId, (tx: Tx) =>
    tx.insert(webhookDeliveries).values({
      groupId,
      webhookEndpointId,
      eventType,
      payload,
      success,
      responseStatus,
      errorMessage,
    }),
  ).catch(() => {});
}
