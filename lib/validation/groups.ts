import { z } from "zod";

export const groupTypes = ["chama", "welfare", "hybrid", "selfhelp"] as const;

export const joinRequestSchema = z.object({
  groupId: z.coerce.number().int().positive(),
  message: z.string().trim().max(500).optional().or(z.literal("")),
});

// Select-driven booleans use "true"/"false" strings, not raw checkboxes —
// z.coerce.boolean() would treat the string "false" as truthy (Boolean("false")
// is true), so this transforms explicit string values instead. .default()
// must apply to the pre-transform enum (its output type is the transform's
// input type), not the post-transform boolean.
const boolString = (def: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(def)
    .transform((v) => v === "true");

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(groupTypes),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  isPublic: boolString("true"),
  requireApproval: boolString("true"),
  maxMembers: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  adminEmail: z.string().trim().email("A valid email for the initial admin is required"),
});

export type JoinRequestInput = z.infer<typeof joinRequestSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
