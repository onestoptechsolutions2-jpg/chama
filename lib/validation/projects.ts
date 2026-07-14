import { z } from "zod";

export const projectStatuses = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  targetAmount: z.coerce.number().nonnegative().default(0),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export const addProjectContributionSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reference: z.string().trim().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type AddProjectContributionInput = z.infer<typeof addProjectContributionSchema>;
