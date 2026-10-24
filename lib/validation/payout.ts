import { z } from "zod";

/** Where group-wallet money may be sent (lib/domain/group-wallet.ts PayoutDestination). */
export const payoutDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bank"), bankCode: z.string().trim(), account: z.string().trim(), name: z.string().trim() }),
  z.object({ kind: z.literal("paybill"), paybill: z.string().trim(), accountRef: z.string().trim(), name: z.string().trim() }),
  z.object({ kind: z.literal("till"), till: z.string().trim(), name: z.string().trim() }),
  z.object({ kind: z.literal("mpesa"), phone: z.string().trim(), name: z.string().trim() }),
]);
