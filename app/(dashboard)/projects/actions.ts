"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { projects, projectContributions, projectStatusEnum } from "@/lib/db/schema";
import { createProjectSchema, addProjectContributionSchema } from "@/lib/validation/projects";

export type ProjectActionState = { error: string } | null;

export async function createProjectAction(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const session = await requireRole("admin", "treasurer");
  const parsed = createProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, description, targetAmount, startDate, endDate } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx.insert(projects).values({
      groupId,
      name,
      description: description || null,
      targetAmount: String(targetAmount),
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: session.user.id,
    }),
  );

  revalidatePath("/projects");
  return null;
}

export async function addProjectContributionAction(
  projectId: number,
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const session = await requireRole("admin", "treasurer");
  const parsed = addProjectContributionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, amount, reference } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    await tx.insert(projectContributions).values({
      groupId,
      projectId,
      memberId,
      amount: String(amount),
      reference: reference || null,
    });

    await tx
      .update(projects)
      .set({
        collectedAmount: sql`${projects.collectedAmount} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.groupId, groupId)));
  });

  revalidatePath("/projects");
  return null;
}

export async function updateProjectStatusAction(
  projectId: number,
  status: (typeof projectStatusEnum.enumValues)[number],
): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(projects)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.groupId, groupId))),
  );

  revalidatePath("/projects");
}
