"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { apiKeys, webhookEndpoints, type webhookEventTypeEnum } from "@/lib/db/schema";
import { generateApiKey } from "@/lib/auth/api-keys";
import { createWebhookEndpointSchema } from "@/lib/validation/developer";

type WebhookEventType = (typeof webhookEventTypeEnum.enumValues)[number];

export type DeveloperActionState = { error: string } | null;

/** Only ever returned once, in the response of the action that created it — never persisted or re-fetchable. */
export type CreateApiKeyResult = { error: string } | { ok: true; plaintext: string };

export async function createApiKeyAction(
  _prev: CreateApiKeyResult | null,
  formData: FormData,
): Promise<CreateApiKeyResult> {
  const session = await requireRole("admin");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give this key a name so you can recognize it later" };

  const groupId = session.activeMembership.groupId;
  const generated = generateApiKey("live");

  await withTenant(groupId, (tx) =>
    tx.insert(apiKeys).values({
      groupId,
      name,
      keyHash: generated.hash,
      keyPrefix: generated.prefix,
      createdByUserId: session.user.id,
    }),
  );

  revalidatePath("/dashboard/developer");
  return { ok: true, plaintext: generated.plaintext };
}

export async function revokeApiKeyAction(keyId: number): Promise<DeveloperActionState> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.groupId, groupId))),
  );

  revalidatePath("/dashboard/developer");
  return null;
}

export type CreateWebhookResult = { error: string } | { ok: true; secret: string };

export async function createWebhookEndpointAction(
  _prev: CreateWebhookResult | null,
  formData: FormData,
): Promise<CreateWebhookResult> {
  const session = await requireRole("admin");
  const parsed = createWebhookEndpointSchema.safeParse({
    url: formData.get("url"),
    description: formData.get("description") || undefined,
    events: formData.getAll("events"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const groupId = session.activeMembership.groupId;
  const secret = randomBytes(24).toString("base64url");

  await withTenant(groupId, (tx) =>
    tx.insert(webhookEndpoints).values({
      groupId,
      url: parsed.data.url,
      description: parsed.data.description || null,
      secret,
      events: parsed.data.events as WebhookEventType[],
      createdByUserId: session.user.id,
    }),
  );

  revalidatePath("/dashboard/developer");
  return { ok: true, secret };
}

export async function toggleWebhookEndpointAction(
  endpointId: number,
  active: boolean,
): Promise<DeveloperActionState> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(webhookEndpoints)
      .set({ active })
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.groupId, groupId))),
  );

  revalidatePath("/dashboard/developer");
  return null;
}

export async function deleteWebhookEndpointAction(endpointId: number): Promise<DeveloperActionState> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.groupId, groupId))),
  );

  revalidatePath("/dashboard/developer");
  return null;
}
