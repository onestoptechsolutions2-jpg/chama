import { z } from "zod";

export const ruleCategories = [
  "general",
  "contributions",
  "loans",
  "mgr",
  "welfare",
  "fines",
  "meetings",
  "projects",
  "other",
] as const;

export const createRuleSchema = z.object({
  category: z.enum(ruleCategories),
  title: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().min(1, "Description is required"),
  penaltyAmount: z.coerce.number().nonnegative().optional().or(z.nan().transform(() => undefined)),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
